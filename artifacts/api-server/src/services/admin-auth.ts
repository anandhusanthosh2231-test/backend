import crypto from "node:crypto";
import { db, adminUsersTable, adminSessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface AdminUser {
  username: string;
  passwordHash: string;
  passwordSalt: string;
  phoneNumber: string;
  mfaEnabled: boolean;
  totpSecret: string;
  updatedAt: Date;
}

interface PendingMfaSession {
  username: string;
  otp: string;
  expiresAt: number;
  attempts: number;
}

interface LoginAttemptRecord {
  count: number;
  lockedUntil: number;
}

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

class AdminAuthService {
  private pendingMfa: Map<string, PendingMfaSession> = new Map();
  private loginAttempts: Map<string, LoginAttemptRecord> = new Map();
  private initialized = false;

  constructor() {
    setInterval(() => this.cleanupExpired(), 60 * 1000);
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;
    
    const initialPassword = process.env.ADMIN_INITIAL_PASSWORD;
    if (!initialPassword) {
      console.error("CRITICAL ERROR: ADMIN_INITIAL_PASSWORD environment variable is missing.");
      console.error("You must set ADMIN_INITIAL_PASSWORD to a secure string to start the server.");
      process.exit(1);
    }

    const username = process.env.ADMIN_INITIAL_USERNAME || "admin";
    const existing = await db.select().from(adminUsersTable).where(eq(adminUsersTable.username, username)).limit(1);

    if (existing.length === 0) {
      const salt = crypto.randomBytes(16).toString("hex");
      const hash = this.hashPassword(initialPassword, salt);
      const totpSecret = crypto.randomBytes(20).toString("hex");

      await db.insert(adminUsersTable).values({
        username,
        passwordHash: hash,
        passwordSalt: salt,
        phoneNumber: process.env.ADMIN_CONTACT_PHONE || "+91 9876543210",
        mfaEnabled: true,
        totpSecret,
      });
      console.log(`[AdminAuthService] Initialized admin user: ${username}`);
    }

    this.initialized = true;
  }

  private hashPassword(password: string, salt: string): string {
    return crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [key, session] of this.pendingMfa.entries()) {
      if (session.expiresAt < now) {
        this.pendingMfa.delete(key);
      }
    }
    for (const [ip, record] of this.loginAttempts.entries()) {
      if (record.lockedUntil < now && record.count >= MAX_LOGIN_ATTEMPTS) {
        this.loginAttempts.delete(ip);
      }
    }
    // We can also periodically clean up DB sessions, but not critical for memory
    db.delete(adminSessionsTable).where(eq(adminSessionsTable.expiresAt, new Date(now))).catch(() => {});
  }

  // ── Rate Limiting ──────────────────────────────────────────────────────────

  public checkLoginRateLimit(ip: string): { allowed: boolean; retryAfterMs?: number } {
    const record = this.loginAttempts.get(ip);
    if (!record) return { allowed: true };
    const now = Date.now();
    if (record.lockedUntil > now) {
      return { allowed: false, retryAfterMs: record.lockedUntil - now };
    }
    if (record.lockedUntil > 0 && record.lockedUntil <= now) {
      this.loginAttempts.delete(ip);
    }
    return { allowed: true };
  }

  public recordFailedLogin(ip: string): void {
    const now = Date.now();
    const record = this.loginAttempts.get(ip) ?? { count: 0, lockedUntil: 0 };
    record.count += 1;
    if (record.count >= MAX_LOGIN_ATTEMPTS) {
      record.lockedUntil = now + LOCKOUT_DURATION_MS;
    }
    this.loginAttempts.set(ip, record);
  }

  public resetLoginAttempts(ip: string): void {
    this.loginAttempts.delete(ip);
  }

  // ── Utility ────────────────────────────────────────────────────────────────

  public maskPhone(phone: string): string {
    if (!phone || phone.length < 7) return phone;
    const clean = phone.trim();
    return clean.slice(0, 6) + " **** " + clean.slice(-2);
  }

  public generateTOTP(secret: string, window = 30): string {
    const epoch = Math.floor(Date.now() / 1000);
    const timeStep = Math.floor(epoch / window);
    const buffer = Buffer.alloc(8);
    buffer.writeBigInt64BE(BigInt(timeStep));
    const hmac = crypto.createHmac("sha1", Buffer.from(secret, "hex")).update(buffer).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000;
    return code.toString().padStart(6, "0");
  }

  // ── Authentication ─────────────────────────────────────────────────────────

  public async verifyCredentials(username: string, password: string): Promise<boolean> {
    if (!username || !password) return false;
    const masterKey = process.env.ADMIN_SECRET_KEY;
    if (masterKey && password === masterKey) {
      return true;
    }

    const rows = await db.select().from(adminUsersTable).where(eq(adminUsersTable.username, username)).limit(1);
    if (rows.length === 0) return false;
    
    const admin = rows[0];
    const computedHash = this.hashPassword(password, admin.passwordSalt);
    return crypto.timingSafeEqual(Buffer.from(computedHash, "hex"), Buffer.from(admin.passwordHash, "hex"));
  }

  public verifyPasskey(key: string): boolean {
    const masterKey = process.env.ADMIN_SECRET_KEY;
    if (!masterKey || !key) return false;
    try {
      const a = Buffer.from(masterKey);
      const b = Buffer.from(key);
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  public async createMfaChallenge(username: string): Promise<{
    tempToken: string;
    maskedPhone: string;
    expiresInSeconds: number;
  }> {
    const rows = await db.select().from(adminUsersTable).where(eq(adminUsersTable.username, username)).limit(1);
    if (rows.length === 0) throw new Error("User not found");
    const admin = rows[0];

    const tempToken = "mfa_tmp_" + crypto.randomBytes(24).toString("hex");
    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresInSeconds = 300;

    this.pendingMfa.set(tempToken, {
      username,
      otp,
      expiresAt: Date.now() + expiresInSeconds * 1000,
      attempts: 0,
    });

    console.log(`\n========================================`);
    console.log(`🔐 [AI RECIPES MFA DISPATCH]`);
    console.log(`📱 Contact Number: ${admin.phoneNumber}`);
    console.log(`🔑 Verification Code: ${otp}`);
    console.log(`⏳ Valid for 5 minutes (Temp Token: ${tempToken.slice(0, 16)}...)`);
    console.log(`========================================\n`);

    return {
      tempToken,
      maskedPhone: this.maskPhone(admin.phoneNumber),
      expiresInSeconds,
    };
  }

  public async verifyMfa(
    tempToken: string,
    otpCode: string,
  ): Promise<{ success: boolean; error?: string; token?: string; user?: { username: string; phoneNumber: string; mfaEnabled: boolean } }> {
    const session = this.pendingMfa.get(tempToken);
    if (!session) {
      return { success: false, error: "MFA session expired or invalid. Please sign in again." };
    }

    if (session.expiresAt < Date.now()) {
      this.pendingMfa.delete(tempToken);
      return { success: false, error: "Verification code has expired. Please request a new code." };
    }

    session.attempts += 1;
    if (session.attempts > 5) {
      this.pendingMfa.delete(tempToken);
      return { success: false, error: "Too many failed attempts. Please restart sign in." };
    }

    const rows = await db.select().from(adminUsersTable).where(eq(adminUsersTable.username, session.username)).limit(1);
    if (rows.length === 0) return { success: false, error: "User not found" };
    const admin = rows[0];

    const cleanOtp = (otpCode || "").trim();
    const isSmsOtpMatch = session.otp === cleanOtp;
    const currentTotp = this.generateTOTP(admin.totpSecret);
    const isTotpMatch = currentTotp === cleanOtp;

    if (!isSmsOtpMatch && !isTotpMatch) {
      return { success: false, error: "Invalid 6-digit verification code. Please check and try again." };
    }

    this.pendingMfa.delete(tempToken);
    const sessionToken = "adm_" + crypto.randomBytes(32).toString("hex");
    const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;
    
    await db.insert(adminSessionsTable).values({
      token: sessionToken,
      username: admin.username,
      expiresAt: new Date(Date.now() + sessionLifetimeMs),
    });

    return {
      success: true,
      token: sessionToken,
      user: {
        username: admin.username,
        phoneNumber: admin.phoneNumber,
        mfaEnabled: admin.mfaEnabled,
      },
    };
  }

  public async resendMfaOtp(tempToken: string): Promise<{ success: boolean; error?: string; maskedPhone?: string }> {
    const session = this.pendingMfa.get(tempToken);
    if (!session) {
      return { success: false, error: "Session expired. Please log in again." };
    }

    const rows = await db.select().from(adminUsersTable).where(eq(adminUsersTable.username, session.username)).limit(1);
    if (rows.length === 0) return { success: false, error: "User not found" };
    const admin = rows[0];

    const newOtp = crypto.randomInt(100000, 999999).toString();
    session.otp = newOtp;
    session.expiresAt = Date.now() + 300 * 1000;
    session.attempts = 0;

    console.log(`\n========================================`);
    console.log(`🔄 [AI RECIPES MFA RESEND]`);
    console.log(`📱 Contact Number: ${admin.phoneNumber}`);
    console.log(`🔑 New Verification Code: ${newOtp}`);
    console.log(`========================================\n`);

    return {
      success: true,
      maskedPhone: this.maskPhone(admin.phoneNumber),
    };
  }

  public async verifyAdminToken(token: string): Promise<boolean> {
    if (!token) return false;
    const cleanToken = token.replace(/^Bearer\s+/i, "").trim();

    const masterKey = process.env.ADMIN_SECRET_KEY;
    if (masterKey && cleanToken === masterKey) {
      return true;
    }

    const rows = await db.select().from(adminSessionsTable).where(eq(adminSessionsTable.token, cleanToken)).limit(1);
    if (rows.length === 0) return false;
    
    const session = rows[0];
    if (session.expiresAt.getTime() < Date.now()) {
      await db.delete(adminSessionsTable).where(eq(adminSessionsTable.token, cleanToken));
      return false;
    }
    return true;
  }

  public async logout(token: string): Promise<void> {
    if (!token) return;
    const cleanToken = token.replace(/^Bearer\s+/i, "").trim();
    await db.delete(adminSessionsTable).where(eq(adminSessionsTable.token, cleanToken));
  }

  public async getSettings(username: string = process.env.ADMIN_INITIAL_USERNAME || "admin"): Promise<{
    username: string;
    phoneNumber: string;
    mfaEnabled: boolean;
    totpSecret: string;
    currentTotpSample: string;
  } | null> {
    const rows = await db.select().from(adminUsersTable).where(eq(adminUsersTable.username, username)).limit(1);
    if (rows.length === 0) return null;
    const admin = rows[0];
    
    return {
      username: admin.username,
      phoneNumber: admin.phoneNumber,
      mfaEnabled: admin.mfaEnabled,
      totpSecret: admin.totpSecret,
      currentTotpSample: this.generateTOTP(admin.totpSecret),
    };
  }

  private validatePasswordStrength(password: string): string | null {
    if (password.length < 8) return "New password must be at least 8 characters.";
    if (!/[A-Z]/.test(password)) return "New password must contain at least one uppercase letter.";
    if (!/[0-9]/.test(password)) return "New password must contain at least one digit.";
    return null;
  }

  public async updateSettings(
    targetUsername: string,
    data: {
      username?: string;
      phoneNumber?: string;
      currentPassword?: string;
      newPassword?: string;
      mfaEnabled?: boolean;
    }
  ): Promise<{ success: boolean; error?: string; message?: string; settings?: any }> {
    const rows = await db.select().from(adminUsersTable).where(eq(adminUsersTable.username, targetUsername)).limit(1);
    if (rows.length === 0) return { success: false, error: "User not found" };
    const admin = rows[0];
    
    const updates: Partial<AdminUser> = { updatedAt: new Date() };

    if (data.newPassword) {
      if (!data.currentPassword) {
        return { success: false, error: "Current password is required to change password." };
      }
      const isCurrentValid = await this.verifyCredentials(admin.username, data.currentPassword);
      if (!isCurrentValid) {
        return { success: false, error: "Current password is incorrect." };
      }
      const strengthError = this.validatePasswordStrength(data.newPassword);
      if (strengthError) {
        return { success: false, error: strengthError };
      }
      const newSalt = crypto.randomBytes(16).toString("hex");
      updates.passwordSalt = newSalt;
      updates.passwordHash = this.hashPassword(data.newPassword, newSalt);
    }

    if (data.username && data.username.trim().length >= 3) {
      updates.username = data.username.trim();
    }

    if (data.phoneNumber && data.phoneNumber.trim().length >= 6) {
      updates.phoneNumber = data.phoneNumber.trim();
    }

    if (typeof data.mfaEnabled === "boolean") {
      updates.mfaEnabled = data.mfaEnabled;
    }

    await db.update(adminUsersTable).set(updates).where(eq(adminUsersTable.username, targetUsername));
    
    const newUsername = updates.username || targetUsername;
    const settings = await this.getSettings(newUsername);

    return {
      success: true,
      message: "Admin security settings updated successfully.",
      settings,
    };
  }

  public async createDirectSession(username: string): Promise<string> {
    const sessionToken = "adm_" + crypto.randomBytes(32).toString("hex");
    await db.insert(adminSessionsTable).values({
      token: sessionToken,
      username,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    return sessionToken;
  }
}

export const adminAuthService = new AdminAuthService();
