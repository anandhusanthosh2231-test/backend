import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { getSession, isEmailAllowed, type SessionUser } from "../services/oauth-admin-auth.ts";

export interface OAuthAuthenticatedRequest extends Request {
  adminUser?: SessionUser;
  sessionToken?: string;
}

const COOKIE_NAME = "admin_session";

function getSessionSecret(): string {
  return process.env.SESSION_SECRET || "fallback_dev_session_secret_change_in_prod";
}

/**
 * Sign cookie value with HMAC-SHA256
 */
export function signCookie(value: string): string {
  const secret = getSessionSecret();
  const signature = crypto.createHmac("sha256", secret).update(value).digest("base64url");
  return `${value}.${signature}`;
}

/**
 * Unsign cookie value and return original string if valid
 */
export function unsignCookie(signedValue: string): string | null {
  if (!signedValue || typeof signedValue !== "string") return null;
  const lastDot = signedValue.lastIndexOf(".");
  if (lastDot === -1) return null;

  const value = signedValue.slice(0, lastDot);
  const expectedSignature = crypto.createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
  const actualSignature = signedValue.slice(lastDot + 1);

  if (expectedSignature.length === actualSignature.length &&
      crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(actualSignature))) {
    return value;
  }

  return null;
}

/**
 * Extract raw cookie value from Request header
 */
export function parseCookie(req: Request, name: string): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";");
  for (const cookie of cookies) {
    const [k, v] = cookie.trim().split("=");
    if (k === name && v) {
      return decodeURIComponent(v);
    }
  }
  return null;
}

/**
 * Helper to set signed session cookie on Response
 */
export function setAdminSessionCookie(res: Response, sessionToken: string): void {
  const signed = signCookie(sessionToken);
  const isProd = process.env.NODE_ENV === "production";
  const maxAge = 7 * 24 * 60 * 60; // 7 days in seconds

  const cookieStr = `${COOKIE_NAME}=${encodeURIComponent(signed)}; Path=/; HttpOnly; ${isProd ? "Secure; " : ""}SameSite=Lax; Max-Age=${maxAge}`;
  res.setHeader("Set-Cookie", cookieStr);
}

/**
 * Helper to clear admin session cookie on Response
 */
export function clearAdminSessionCookie(res: Response): void {
  const isProd = process.env.NODE_ENV === "production";
  const cookieStr = `${COOKIE_NAME}=; Path=/; HttpOnly; ${isProd ? "Secure; " : ""}SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  res.setHeader("Set-Cookie", cookieStr);
}

/**
 * Middleware protecting admin routes
 */
export function requireAdminSession(
  req: OAuthAuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const rawCookie = parseCookie(req, COOKIE_NAME);
  if (!rawCookie) {
    res.status(401).json({ error: "Unauthorized", message: "Admin session required." });
    return;
  }

  const token = unsignCookie(rawCookie);
  if (!token) {
    res.status(401).json({ error: "Unauthorized", message: "Invalid session cookie." });
    return;
  }

  const session = getSession(token);
  if (!session) {
    res.status(401).json({ error: "Unauthorized", message: "Session expired or revoked." });
    return;
  }

  // Re-verify allowlist
  if (!isEmailAllowed(session.email)) {
    res.status(403).json({ error: "Forbidden", message: "Account is not on admin allow-list." });
    return;
  }

  req.adminUser = session;
  req.sessionToken = token;
  next();
}

/**
 * CSRF Protection Middleware for state-changing HTTP methods
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  const safeMethods = ["GET", "HEAD", "OPTIONS"];
  if (safeMethods.includes(req.method.toUpperCase())) {
    return next();
  }

  // Enforce custom header for state-changing requests (or SameSite=Lax cookie verification)
  const requestedWith = req.headers["x-requested-with"];
  const customCsrfHeader = req.headers["x-admin-csrf"];

  if (requestedWith === "XMLHttpRequest" || customCsrfHeader === "1" || req.headers.accept?.includes("application/json")) {
    return next();
  }

  res.status(403).json({ error: "CSRF verification failed", message: "State-changing requests require standard headers." });
}
