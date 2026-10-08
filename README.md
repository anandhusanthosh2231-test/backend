# AI Recipes MVP — Admin Social Authentication & Security Guide

## Overview
AI Recipes uses Google and GitHub OAuth 2.0 with PKCE and an encrypted, peppered HMAC-SHA256 allow-list for admin authorization. 

There is **no database table or UI screen** for editing the admin allow-list. Access is controlled strictly via host environment variables.

---

## 1. OAuth Application Setup

### A. Google OAuth 2.0 Setup
1. Go to the [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials).
2. Create a new **OAuth 2.0 Client ID** (Web application).
3. Set Authorized Redirect URIs:
   - **Local Development**: `http://localhost:5000/api/auth/google/callback`
   - **Production**: `https://yourdomain.com/api/auth/google/callback`
4. Copy `Client ID` and `Client Secret` to your host environment secrets:
   ```env
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   ```

### B. GitHub OAuth App Setup
1. Go to [GitHub Developer Settings — OAuth Apps](https://github.com/settings/developers).
2. Click **New OAuth App**.
3. Set Authorization Callback URL:
   - **Local Development**: `http://localhost:5000/api/auth/github/callback`
   - **Production**: `https://yourdomain.com/api/auth/github/callback`
4. Copy `Client ID` and `Client Secret` to your host environment secrets:
   ```env
   GITHUB_CLIENT_ID=your_github_client_id
   GITHUB_CLIENT_SECRET=your_github_client_secret
   ```

---

## 2. Managing the Admin Allow-List (CLI)

Admin access is granted strictly to emails whose HMAC-SHA256 hash matches an entry in `ADMIN_ALLOWLIST_HASHES`.

### Adding an Admin
Run the CLI utility locally with your `ADMIN_ALLOWLIST_PEPPER`:
```bash
node scripts/admin-allowlist.mjs add someone@gmail.com
```
The script will output an updated `ADMIN_ALLOWLIST_HASHES` string. Copy and paste this string into your hosting platform's secrets/environment configuration.

### Removing an Admin
```bash
node scripts/admin-allowlist.mjs remove someone@gmail.com
```
Copy and update `ADMIN_ALLOWLIST_HASHES` on your hosting platform.

### Listing Hashes
```bash
node scripts/admin-allowlist.mjs list-hashes
```

---

## 3. Required Environment Variables

| Variable | Description |
|---|---|
| `SESSION_SECRET` | Cryptographic secret for signing HttpOnly admin session cookies |
| `ADMIN_ALLOWLIST_PEPPER` | Secret key used for HMAC-SHA256 email hashing |
| `ADMIN_ALLOWLIST_HASHES` | Comma-separated list of allowed email hashes |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret |
| `GITHUB_CLIENT_ID` | GitHub OAuth Client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth Client Secret |

---

## 4. Running Tests & Server
```bash
# Run unit tests
node --experimental-strip-types --test ./artifacts/api-server/src/__tests__/oauth-admin.test.ts

# Build workspace
pnpm run build

# Start dev server
pnpm run dev
```
