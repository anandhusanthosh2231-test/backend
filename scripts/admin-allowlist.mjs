#!/usr/bin/env node

/**
 * ADMIN ALLOW-LIST CLI UTILITY
 * 
 * Usage:
 *   node scripts/admin-allowlist.mjs add <email>
 *   node scripts/admin-allowlist.mjs check <email>
 *   node scripts/admin-allowlist.mjs remove <email>
 *   node scripts/admin-allowlist.mjs list-hashes
 * 
 * Note:
 *   - Uses HMAC-SHA256 with ADMIN_ALLOWLIST_PEPPER.
 *   - Zero-trust: Plaintext emails are never stored in databases or env files.
 *   - Automatically updates local .env file if present.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "..", ".env");

function loadEnv() {
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        const [key, ...valParts] = trimmed.split("=");
        const val = valParts.join("=").trim().replace(/^["']|["']$/g, "");
        process.env[key.trim()] = val;
      }
    }
  }
}

loadEnv();

function saveEnvHashes(hashes) {
  const newHashesVal = hashes.join(",");
  if (fs.existsSync(envPath)) {
    let content = fs.readFileSync(envPath, "utf-8");
    if (/^ADMIN_ALLOWLIST_HASHES=/m.test(content)) {
      content = content.replace(/^ADMIN_ALLOWLIST_HASHES=.*$/m, `ADMIN_ALLOWLIST_HASHES=${newHashesVal}`);
    } else {
      content += `\nADMIN_ALLOWLIST_HASHES=${newHashesVal}\n`;
    }
    fs.writeFileSync(envPath, content, "utf-8");
    console.log("💾 Automatically updated .env file with new ADMIN_ALLOWLIST_HASHES.");
  }
}

function normalizeEmail(email) {
  if (!email || typeof email !== "string") return "";
  return email.trim().toLowerCase();
}

function hashEmail(email, pepper) {
  const normalized = normalizeEmail(email);
  return crypto.createHmac("sha256", pepper).update(normalized).digest("hex");
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const targetEmail = args[1];

  const pepper = process.env.ADMIN_ALLOWLIST_PEPPER;
  if (!pepper) {
    console.error("❌ ERROR: ADMIN_ALLOWLIST_PEPPER environment variable is missing.");
    console.error("Please set ADMIN_ALLOWLIST_PEPPER in your .env file before running this script.");
    process.exit(1);
  }

  const existingHashesEnv = process.env.ADMIN_ALLOWLIST_HASHES || "";
  let hashes = existingHashesEnv
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);

  if (command === "add") {
    if (!targetEmail || !targetEmail.includes("@")) {
      console.error("❌ ERROR: Please specify a valid email address to add.");
      console.log("Usage: node scripts/admin-allowlist.mjs add you@example.com");
      process.exit(1);
    }
    const hash = hashEmail(targetEmail, pepper);
    if (!hashes.includes(hash)) {
      hashes.push(hash);
      saveEnvHashes(hashes);
      console.log(`\n✅ Successfully added "${normalizeEmail(targetEmail)}" to the admin allow-list.`);
    } else {
      console.log(`\nℹ️ Email "${normalizeEmail(targetEmail)}" is already on the allow-list.`);
    }
    console.log("\nADMIN_ALLOWLIST_HASHES=" + hashes.join(",") + "\n");
    console.log("⚠️ If running api-server in another terminal, please restart it to apply the new allow-list.");

  } else if (command === "check") {
    if (!targetEmail || !targetEmail.includes("@")) {
      console.error("❌ ERROR: Please specify a valid email address to check.");
      console.log("Usage: node scripts/admin-allowlist.mjs check you@example.com");
      process.exit(1);
    }
    const hash = hashEmail(targetEmail, pepper);
    const isAllowed = hashes.includes(hash);
    if (isAllowed) {
      console.log(`\n🟢 ALLOWED: "${normalizeEmail(targetEmail)}" is ON the admin allow-list.`);
    } else {
      console.log(`\n🔴 DENIED: "${normalizeEmail(targetEmail)}" is NOT on the admin allow-list.`);
      console.log(`To authorize this email, run:`);
      console.log(`  node scripts/admin-allowlist.mjs add ${normalizeEmail(targetEmail)}`);
    }

  } else if (command === "remove") {
    if (!targetEmail || !targetEmail.includes("@")) {
      console.error("❌ ERROR: Please specify a valid email address to remove.");
      process.exit(1);
    }
    const hash = hashEmail(targetEmail, pepper);
    if (hashes.includes(hash)) {
      hashes = hashes.filter((h) => h !== hash);
      saveEnvHashes(hashes);
      console.log(`\n✅ Removed "${normalizeEmail(targetEmail)}" from allow-list.`);
    } else {
      console.log(`\nℹ️ Email "${normalizeEmail(targetEmail)}" was not in the allow-list.`);
    }
    console.log("\nADMIN_ALLOWLIST_HASHES=" + hashes.join(",") + "\n");

  } else if (command === "list-hashes" || command === "status") {
    console.log("\n📋 Admin Allow-List Status:");
    console.log(`- Pepper configured: ${pepper ? "Yes (active)" : "No"}`);
    console.log(`- Total authorized admin accounts: ${hashes.length}`);
    console.log(`\nADMIN_ALLOWLIST_HASHES=${hashes.join(",")}\n`);
    if (hashes.length === 0) {
      console.log("⚠️ No admins are currently authorized. To add your email, run:");
      console.log("  node scripts/admin-allowlist.mjs add your-email@gmail.com\n");
    }

  } else {
    console.log("\n🛡️ Admin Allow-List CLI Utility");
    console.log("---------------------------------");
    console.log("Usage:");
    console.log("  node scripts/admin-allowlist.mjs add <email>      Add an admin email");
    console.log("  node scripts/admin-allowlist.mjs check <email>    Check if an email is authorized");
    console.log("  node scripts/admin-allowlist.mjs remove <email>   Remove an admin email");
    console.log("  node scripts/admin-allowlist.mjs status           Check current allow-list status");
    console.log("");
  }
}

main();
