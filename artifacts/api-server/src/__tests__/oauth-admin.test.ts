import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeEmail,
  hashEmail,
  isEmailAllowed,
  generatePKCE,
  saveOAuthState,
  consumeOAuthState,
  createSession,
  getSession,
  revokeSession,
} from "../services/oauth-admin-auth.ts";
import { requireAdmin } from "../middlewares/auth.ts";
import { signCookie, unsignCookie } from "../middlewares/oauth-session.ts";

describe("OAuth Admin Security & Allow-list Unit Tests", () => {
  const TEST_PEPPER = "test_secret_pepper_987654321";
  const ALLOWED_EMAIL_1 = "admin@example.com";
  const ALLOWED_EMAIL_2 = "supervisor@company.org";
  const UNLISTED_EMAIL = "hacker@malicious.com";

  let hash1: string;
  let hash2: string;

  beforeEach(() => {
    process.env.ADMIN_ALLOWLIST_PEPPER = TEST_PEPPER;
    hash1 = hashEmail(ALLOWED_EMAIL_1, TEST_PEPPER);
    hash2 = hashEmail(ALLOWED_EMAIL_2, TEST_PEPPER);
    process.env.ADMIN_ALLOWLIST_HASHES = `${hash1},${hash2}`;
  });

  describe("1. Email Normalization", () => {
    test("trims leading/trailing whitespace and converts to lowercase", () => {
      assert.equal(normalizeEmail("  Admin@Example.COM  "), "admin@example.com");
      assert.equal(normalizeEmail("User.Name@Domain.Org "), "user.name@domain.org");
    });

    test("handles empty or invalid inputs gracefully", () => {
      assert.equal(normalizeEmail(""), "");
      assert.equal(normalizeEmail(null as any), "");
    });
  });

  describe("2. HMAC Email Hashing & Comparison", () => {
    test("produces deterministic HMAC-SHA256 hex string", () => {
      const h1 = hashEmail("admin@example.com", TEST_PEPPER);
      const h2 = hashEmail("ADMIN@EXAMPLE.COM", TEST_PEPPER);
      assert.equal(h1, h2);
      assert.equal(h1.length, 64); // SHA256 hex string length
    });

    test("different pepper produces different hash", () => {
      const h1 = hashEmail(ALLOWED_EMAIL_1, TEST_PEPPER);
      const h2 = hashEmail(ALLOWED_EMAIL_1, "different_pepper");
      assert.notEqual(h1, h2);
    });
  });

  describe("3. Fail-Closed Allow-List Verification", () => {
    test("returns true for exact allowed emails regardless of casing/spacing", () => {
      assert.equal(isEmailAllowed("admin@example.com"), true);
      assert.equal(isEmailAllowed(" ADMIN@EXAMPLE.COM "), true);
      assert.equal(isEmailAllowed("supervisor@company.org"), true);
    });

    test("returns false for unlisted email address", () => {
      assert.equal(isEmailAllowed(UNLISTED_EMAIL), false);
    });

    test("FAIL-CLOSED: returns false when ADMIN_ALLOWLIST_PEPPER is missing", () => {
      delete process.env.ADMIN_ALLOWLIST_PEPPER;
      assert.equal(isEmailAllowed(ALLOWED_EMAIL_1), false);
    });

    test("FAIL-CLOSED: returns false when ADMIN_ALLOWLIST_HASHES is missing or empty", () => {
      delete process.env.ADMIN_ALLOWLIST_HASHES;
      assert.equal(isEmailAllowed(ALLOWED_EMAIL_1), false);

      process.env.ADMIN_ALLOWLIST_HASHES = "   ";
      assert.equal(isEmailAllowed(ALLOWED_EMAIL_1), false);
    });
  });

  describe("4. PKCE & OAuth State Security", () => {
    test("generates valid PKCE code verifier and base64url code challenge", () => {
      const { codeVerifier, codeChallenge } = generatePKCE();
      assert.ok(codeVerifier.length >= 43);
      assert.ok(codeChallenge.length >= 43);
      assert.equal(codeChallenge.includes("+"), false);
      assert.equal(codeChallenge.includes("/"), false);
    });

    test("OAuth state is valid for one-time use only", () => {
      const state = saveOAuthState("google", "test_verifier_123");
      const res1 = consumeOAuthState(state, "google");
      assert.equal(res1.valid, true);
      assert.equal(res1.codeVerifier, "test_verifier_123");

      // Second consumption must fail (one-time use)
      const res2 = consumeOAuthState(state, "google");
      assert.equal(res2.valid, false);
    });

    test("OAuth state rejects mismatched provider", () => {
      const state = saveOAuthState("google", "test_verifier_123");
      const res = consumeOAuthState(state, "github");
      assert.equal(res.valid, false);
    });
  });

  describe("5. Signed Session Cookie & Revocation", () => {
    test("signs and unsigns session cookie correctly", () => {
      process.env.SESSION_SECRET = "super_secret_key_12345";
      const token = "sample_session_token_xyz";
      const signed = signCookie(token);

      assert.ok(signed.startsWith(`${token}.`));
      const unsigned = unsignCookie(signed);
      assert.equal(unsigned, token);
    });

    test("rejects tampered cookie signatures", () => {
      process.env.SESSION_SECRET = "super_secret_key_12345";
      const token = "sample_session_token_xyz";
      const signed = signCookie(token);
      const tampered = signed + "tampered_bytes";

      assert.equal(unsignCookie(tampered), null);
    });

    test("session store supports creation, lookup, allowlist re-check, and revocation", () => {
      const token = createSession(ALLOWED_EMAIL_1, "google");
      const session = getSession(token);
      assert.ok(session);
      assert.equal(session.email, ALLOWED_EMAIL_1);
      assert.equal(session.provider, "google");

      // Revoke session
      revokeSession(token);
      assert.equal(getSession(token), null);
    });

    test("revokes session if email is subsequently removed from allow-list", () => {
      const token = createSession(ALLOWED_EMAIL_1, "google");
      assert.ok(getSession(token));

      // Remove ALLOWED_EMAIL_1 from allow-list
      process.env.ADMIN_ALLOWLIST_HASHES = hash2; // Only hash2 remains

      // Session lookup should fail and auto-revoke
      assert.equal(getSession(token), null);
    });

    test("requireAdmin accepts a valid admin session cookie", async () => {
      const allowedEmail = "admin@example.com";
      const token = createSession(allowedEmail, "google");
      const signed = signCookie(token);
      const req: any = {
        headers: { cookie: `admin_session=${encodeURIComponent(signed)}` },
      };
      const res: any = {
        statusCode: 200,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(payload: unknown) {
          this.payload = payload;
          return this;
        },
      };

      let nextCalled = false;
      await requireAdmin(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      assert.equal(req.userId, allowedEmail);
    });
  });
});
