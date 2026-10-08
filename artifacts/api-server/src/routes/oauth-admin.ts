import { Router, type Request, type Response, type NextFunction } from "express";
import {
  generatePKCE,
  saveOAuthState,
  consumeOAuthState,
  isEmailAllowed,
  auditLog,
  createSession,
  getSession,
  revokeSession,
  normalizeEmail,
} from "../services/oauth-admin-auth";
import {
  setAdminSessionCookie,
  clearAdminSessionCookie,
  parseCookie,
  unsignCookie,
  requireAdminSession,
  type OAuthAuthenticatedRequest,
} from "../middlewares/oauth-session";
import { logger } from "../lib/logger";

const router = Router();

// Rate limiter for auth endpoints (IP -> request timestamps)
const rateLimitMap = new Map<string, number[]>();
function checkAuthRateLimit(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 15;

  const timestamps = (rateLimitMap.get(ip) || []).filter((ts) => now - ts < windowMs);
  if (timestamps.length >= maxRequests) {
    return false;
  }
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return true;
}

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  if (Array.isArray(forwarded) && forwarded.length > 0) return forwarded[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

function getBaseUrl(req: Request): string {
  const host = req.headers.host || "localhost:5000";
  const protocol = req.headers["x-forwarded-proto"] === "https" || req.secure ? "https" : "http";
  return `${protocol}://${host}`;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const visible = local.length > 2 ? local.slice(0, 2) : local.slice(0, 1);
  return `${visible}***@${domain}`;
}

/**
 * 1. GOOGLE OAUTH INITIATE
 */
router.get("/auth/google", (req: Request, res: Response) => {
  const ip = getClientIp(req);
  if (!checkAuthRateLimit(ip)) {
    res.status(429).json({ error: "Too many authentication requests. Please wait a minute." });
    return;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    logger.warn("FAIL-CLOSED: GOOGLE_CLIENT_ID environment variable missing");
    res.redirect("/admin?error=google_unconfigured");
    return;
  }

  const { codeVerifier, codeChallenge } = generatePKCE();
  const state = saveOAuthState("google", codeVerifier);
  const redirectUri = `${getBaseUrl(req)}/api/auth/google/callback`;

  const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  googleAuthUrl.searchParams.set("client_id", clientId);
  googleAuthUrl.searchParams.set("redirect_uri", redirectUri);
  googleAuthUrl.searchParams.set("response_type", "code");
  googleAuthUrl.searchParams.set("scope", "openid email profile");
  googleAuthUrl.searchParams.set("state", state);
  googleAuthUrl.searchParams.set("code_challenge", codeChallenge);
  googleAuthUrl.searchParams.set("code_challenge_method", "S256");

  res.redirect(googleAuthUrl.toString());
});

/**
 * 2. GOOGLE OAUTH CALLBACK
 */
router.get("/auth/google/callback", async (req: Request, res: Response, next: NextFunction) => {
  const ip = getClientIp(req);
  try {
    const { code, state, error } = req.query;

    if (error || !code || !state || typeof code !== "string" || typeof state !== "string") {
      auditLog({ provider: "google", allowed: false, ip, reason: "OAuth cancelled or code missing" });
      res.redirect("/admin?error=cancelled");
      return;
    }

    const { valid, codeVerifier } = consumeOAuthState(state, "google");
    if (!valid || !codeVerifier) {
      auditLog({ provider: "google", allowed: false, ip, reason: "Invalid or expired OAuth state" });
      res.redirect("/admin?error=cancelled");
      return;
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      auditLog({ provider: "google", allowed: false, ip, reason: "Google client secrets missing" });
      res.redirect("/admin?error=not_allowed");
      return;
    }

    const redirectUri = `${getBaseUrl(req)}/api/auth/google/callback`;

    // Token exchange
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      logger.error(`Google token exchange error: ${errText}`);
      auditLog({ provider: "google", allowed: false, ip, reason: "Token exchange failed" });
      res.redirect("/admin?error=cancelled");
      return;
    }

    const tokens = (await tokenRes.json()) as { id_token?: string; access_token?: string };
    const idToken = tokens.id_token;

    if (!idToken) {
      auditLog({ provider: "google", allowed: false, ip, reason: "Missing ID token" });
      res.redirect("/admin?error=cancelled");
      return;
    }

    // Decode and verify ID Token payload
    const parts = idToken.split(".");
    if (parts.length !== 3) {
      auditLog({ provider: "google", allowed: false, ip, reason: "Malformed ID token" });
      res.redirect("/admin?error=cancelled");
      return;
    }

    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));

    // Check audience, issuer, expiry, and email_verified
    const nowSec = Math.floor(Date.now() / 1000);
    const validAud = payload.aud === clientId;
    const validIss = payload.iss === "https://accounts.google.com" || payload.iss === "accounts.google.com";
    const validExp = payload.exp && payload.exp > nowSec;
    const emailVerified = payload.email_verified === true;

    if (!validAud || !validIss || !validExp || !emailVerified || !payload.email) {
      auditLog({
        provider: "google",
        allowed: false,
        ip,
        reason: `ID token verification failed (aud:${validAud}, iss:${validIss}, exp:${validExp}, verified:${emailVerified})`,
      });
      res.redirect("/admin?error=not_allowed");
      return;
    }

    const normalizedEmail = normalizeEmail(payload.email);

    if (!isEmailAllowed(normalizedEmail)) {
      auditLog({ provider: "google", allowed: false, ip, reason: "Email not on allow-list" });
      res.redirect("/admin?error=not_allowed");
      return;
    }

    // Success! Create session and set HTTP-only cookie
    auditLog({ provider: "google", allowed: true, ip });
    const sessionToken = createSession(normalizedEmail, "google");
    setAdminSessionCookie(res, sessionToken);
    res.redirect("/admin");
  } catch (err) {
    logger.error({ err }, "Error in Google callback");
    next(err);
  }
});

/**
 * 3. GITHUB OAUTH INITIATE
 */
router.get("/auth/github", (req: Request, res: Response) => {
  const ip = getClientIp(req);
  if (!checkAuthRateLimit(ip)) {
    res.status(429).json({ error: "Too many authentication requests. Please wait a minute." });
    return;
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    logger.warn("FAIL-CLOSED: GITHUB_CLIENT_ID environment variable missing");
    res.redirect("/admin?error=github_unconfigured");
    return;
  }

  const { codeVerifier, codeChallenge } = generatePKCE();
  const state = saveOAuthState("github", codeVerifier);
  const redirectUri = `${getBaseUrl(req)}/api/auth/github/callback`;

  const githubAuthUrl = new URL("https://github.com/login/oauth/authorize");
  githubAuthUrl.searchParams.set("client_id", clientId);
  githubAuthUrl.searchParams.set("redirect_uri", redirectUri);
  githubAuthUrl.searchParams.set("scope", "user:email");
  githubAuthUrl.searchParams.set("state", state);

  res.redirect(githubAuthUrl.toString());
});

/**
 * 4. GITHUB OAUTH CALLBACK
 */
router.get("/auth/github/callback", async (req: Request, res: Response, next: NextFunction) => {
  const ip = getClientIp(req);
  try {
    const { code, state, error } = req.query;

    if (error || !code || !state || typeof code !== "string" || typeof state !== "string") {
      auditLog({ provider: "github", allowed: false, ip, reason: "OAuth cancelled or code missing" });
      res.redirect("/admin?error=cancelled");
      return;
    }

    const { valid } = consumeOAuthState(state, "github");
    if (!valid) {
      auditLog({ provider: "github", allowed: false, ip, reason: "Invalid or expired OAuth state" });
      res.redirect("/admin?error=cancelled");
      return;
    }

    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      auditLog({ provider: "github", allowed: false, ip, reason: "GitHub client secrets missing" });
      res.redirect("/admin?error=not_allowed");
      return;
    }

    const redirectUri = `${getBaseUrl(req)}/api/auth/github/callback`;

    // Token exchange
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      auditLog({ provider: "github", allowed: false, ip, reason: "Token exchange failed" });
      res.redirect("/admin?error=cancelled");
      return;
    }

    const tokens = (await tokenRes.json()) as { access_token?: string };
    const accessToken = tokens.access_token;
    if (!accessToken) {
      auditLog({ provider: "github", allowed: false, ip, reason: "Access token missing" });
      res.redirect("/admin?error=cancelled");
      return;
    }

    // Fetch user emails from GitHub API
    const emailsRes = await fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "AI-Recipes-Admin-Auth",
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!emailsRes.ok) {
      auditLog({ provider: "github", allowed: false, ip, reason: "Failed to fetch GitHub user emails" });
      res.redirect("/admin?error=not_allowed");
      return;
    }

    const emails = (await emailsRes.json()) as Array<{ email: string; primary: boolean; verified: boolean }>;
    const primaryVerified = emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified);

    if (!primaryVerified || !primaryVerified.email) {
      auditLog({ provider: "github", allowed: false, ip, reason: "No verified email found on GitHub account" });
      res.redirect("/admin?error=not_allowed");
      return;
    }

    const normalizedEmail = normalizeEmail(primaryVerified.email);

    if (!isEmailAllowed(normalizedEmail)) {
      auditLog({ provider: "github", allowed: false, ip, reason: "Email not on allow-list" });
      res.redirect("/admin?error=not_allowed");
      return;
    }

    // Success! Create session and set HTTP-only cookie
    auditLog({ provider: "github", allowed: true, ip });
    const sessionToken = createSession(normalizedEmail, "github");
    setAdminSessionCookie(res, sessionToken);
    res.redirect("/admin");
  } catch (err) {
    logger.error({ err }, "Error in GitHub callback");
    next(err);
  }
});

/**
 * 5. GET SESSION STATUS (/api/auth/me)
 */
router.get("/auth/me", (req: Request, res: Response) => {
  const rawCookie = parseCookie(req, "admin_session");
  if (!rawCookie) {
    res.status(401).json({ authenticated: false });
    return;
  }

  const token = unsignCookie(rawCookie);
  if (!token) {
    res.status(401).json({ authenticated: false });
    return;
  }

  const session = getSession(token);
  if (!session) {
    res.status(401).json({ authenticated: false });
    return;
  }

  res.json({
    authenticated: true,
    user: {
      emailMasked: maskEmail(session.email),
      provider: session.provider,
    },
  });
});

/**
 * 6. LOGOUT (/api/auth/logout)
 */
router.post("/auth/logout", (req: Request, res: Response) => {
  const rawCookie = parseCookie(req, "admin_session");
  if (rawCookie) {
    const token = unsignCookie(rawCookie);
    if (token) {
      revokeSession(token);
    }
  }
  clearAdminSessionCookie(res);
  res.json({ success: true, message: "Logged out successfully." });
});

export default router;
