import {
  boolean,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const adminUsersTable = pgTable("admin_users", {
  username: text("username").primaryKey(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  phoneNumber: text("phone_number").notNull(),
  mfaEnabled: boolean("mfa_enabled").notNull().default(true),
  totpSecret: text("totp_secret").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const adminSessionsTable = pgTable("admin_sessions", {
  token: text("token").primaryKey(),
  username: text("username").notNull().references(() => adminUsersTable.username),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
