/**
 * ADMIN AUTHENTICATION & ALLOW-LIST SERVICE
 * 
 * SECURITY NOTICE:
 * There is NO API route, admin-panel screen, or database table that edits the allow-list.
 * The allow-list is stored encrypted/hashed in environment variables and can ONLY be changed
 * by updating host environment variables / secrets and re-deploying or restarting the server.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { logger } from "../lib/logger.ts";

export interface SessionUser {
  email: string;
  provider: "google" | "github";
  authenticatedAt: number;
}

// Memory store for active sessions (token -> SessionUser)
const sessionStore = new Map<string, SessionUser>();

// Memory store for OAuth PKCE state (state -> { provider, codeVerifier, createdAt })
interface OAuthStateData {
  provider: "google" | "github";
  codeVerifier: string;
  createdAt: number;
}
const oauthStateStore = new Map<string, OAuthStateData>();

// Clean up expired states older than 10 minutes every 5 minutes
const oauthStateCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [state, data] of oauthStateStore.entries()) {
    if (now - data.createdAt > 10 * 60 * 1000) {
      oauthStateStore.delete(state);
    }
  }
}, 5 * 60 * 1000);
oauthStateCleanupTimer.unref();

export function normalizeEmail(email: string): string {
  if (!email || typeof email !== "string") return "";
  return email.trim().toLowerCase();
}

export function hashEmail(email: string, pepper: string): string {
  const normalized = normalizeEmail(email);
  return crypto.createHmac("sha256", pepper).update(normalized).digest("hex");
}

function findEnvPath(): string | null {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "..", ".env"),
    path.resolve(process.cwd(), "..", "..", ".env"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function getEnvOrFileValue(key: string): string | undefined {
  if (process.env[key] && process.env[key].trim() !== "") {
    return process.env[key];
  }

  try {
    const envFile = findEnvPath();
    if (!envFile) return undefined;

    const envContent = fs.readFileSync(envFile, "utf-8");
    const match = envContent.match(new RegExp(`^${key}=(.*)$`, "m"));
    if (!match) return undefined;

    const value = match[1].trim().replace(/^['\"]|['\"]$/g, "");
    if (value) {
      process.env[key] = value;
      return value;
    }
  } catch {
    // Ignore fs read errors and fall back to process.env
  }

  return undefined;
}

/**
 * Checks whether a given email is on the admin allow-list.
 * Fails closed if ADMIN_ALLOWLIST_PEPPER or ADMIN_ALLOWLIST_HASHES is missing or empty.
 */
export function isEmailAllowed(email: string): boolean {
  const pepper = getEnvOrFileValue("ADMIN_ALLOWLIST_PEPPER");
  const hashesEnv = getEnvOrFileValue("ADMIN_ALLOWLIST_HASHES");

  if (!pepper || !hashesEnv) {
    logger.warn("FAIL-CLOSED: ADMIN_ALLOWLIST_PEPPER or ADMIN_ALLOWLIST_HASHES missing from env");
    return false;
  }

  const allowedHashes = hashesEnv
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);

  if (allowedHashes.length === 0) {
    logger.warn("FAIL-CLOSED: ADMIN_ALLOWLIST_HASHES is empty");
    return false;
  }

  const targetHash = hashEmail(email, pepper);
  const targetBuffer = Buffer.from(targetHash, "hex");

  for (const allowedHash of allowedHashes) {
    try {
      const allowedBuffer = Buffer.from(allowedHash, "hex");
      if (allowedBuffer.length === targetBuffer.length) {
        if (crypto.timingSafeEqual(allowedBuffer, targetBuffer)) {
          return true;
        }
      }
    } catch {
      // Ignore invalid hex strings in env
    }
  }

  return false;
}

/**
 * Audit log helper: NEVER logs plain emails.
 */
export function auditLog(params: {
  provider: "google" | "github";
  allowed: boolean;
  ip: string;
  reason?: string;
}): void {
  const timestamp = new Date().toISOString();
  const status = params.allowed ? "ALLOWED" : "DENIED";
  const reasonText = params.reason ? ` | reason: ${params.reason}` : "";
  logger.info(`[ADMIN AUDIT LOG] ${timestamp} | provider: ${params.provider} | status: ${status} | ip: ${params.ip}${reasonText}`);
}

/**
 * Generate PKCE code verifier and challenge
 */
export function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32).toString("hex");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return { codeVerifier, codeChallenge };
}

/**
 * Save OAuth state for validation on callback
 */
export function saveOAuthState(provider: "google" | "github", codeVerifier: string): string {
  const state = crypto.randomBytes(24).toString("hex");
  oauthStateStore.set(state, {
    provider,
    codeVerifier,
    createdAt: Date.now(),
  });
  return state;
}

/**
 * Consume OAuth state (one-time use)
 */
export function consumeOAuthState(state: string, expectedProvider: "google" | "github"): { valid: boolean; codeVerifier?: string } {
  if (!state) return { valid: false };
  const data = oauthStateStore.get(state);
  if (!data) return { valid: false };
  
  oauthStateStore.delete(state);
  
  if (data.provider !== expectedProvider) return { valid: false };
  if (Date.now() - data.createdAt > 10 * 60 * 1000) return { valid: false };

  return { valid: true, codeVerifier: data.codeVerifier };
}

/**
 * Session Management
 */
export function createSession(email: string, provider: "google" | "github"): string {
  const sessionToken = crypto.randomBytes(32).toString("hex");
  const user: SessionUser = {
    email: normalizeEmail(email),
    provider,
    authenticatedAt: Date.now(),
  };
  sessionStore.set(sessionToken, user);
  return sessionToken;
}

export function getSession(sessionToken: string): SessionUser | null {
  if (!sessionToken) return null;
  const session = sessionStore.get(sessionToken);
  if (!session) return null;

  // Session duration: 7 days
  const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
  if (Date.now() - session.authenticatedAt > MAX_AGE) {
    sessionStore.delete(sessionToken);
    return null;
  }

  // Double check allow-list on every getSession check
  if (!isEmailAllowed(session.email)) {
    sessionStore.delete(sessionToken);
    return null;
  }

  return session;
}

export function revokeSession(sessionToken: string): void {
  if (sessionToken) {
    sessionStore.delete(sessionToken);
  }
}
