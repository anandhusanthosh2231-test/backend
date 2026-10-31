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

## Automated browser tests

The browser-based functionality suite lives in `tests/e2e` and uses Playwright
with mocked API responses, so it does not need a running database or live
credentials. Install Chromium once on a new machine:

```bash
pnpm exec playwright install chromium
```

`pnpm run build` type-checks the workspace, builds all packages, and runs the
browser suite against the built frontend. To rerun the suite after a build:

```bash
pnpm run test:e2e
```

## Production deployment

Commit your changes on `main`, then run the root deployment script from
PowerShell:

```powershell
.\deploy.ps1
```

The script builds and tests the workspace, pushes `main` to trigger Render,
waits for the API release to become healthy, and deploys the frontend Worker
to Cloudflare. It requires a clean `main` worktree, plus authenticated Git,
Render auto-deploy, and Wrangler CLI access.

## Admin UI URL

The admin UI route is configured with matching `ADMIN_PATH` (API server) and
`VITE_ADMIN_PATH` (frontend build) values. Set both to the same random,
dedicated path in local `.env` and in the corresponding deployment
environments. `VITE_ADMIN_PATH` is included in the public frontend bundle, so
this only obscures the URL; it is not a security boundary. Keep the existing
admin authentication and IP restrictions enabled. The old `/admin` UI route
is not an admin entry point.

The admin route is intentionally not listed in the public site navigation.
For local development, open the route configured by `VITE_ADMIN_PATH` after
starting the app with `pnpm run dev`; configure the matching `ADMIN_PATH` on
the API server. Production requires the same matching values in the frontend
build and API hosting environment.

## ImageKit setup

The admin Media Library supports uploading and managing recipe images with
ImageKit. ImageKit uploads are optional and remain disabled until an ImageKit
account is configured. Add `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, and
`IMAGEKIT_URL_ENDPOINT` to the backend `.env` (or hosting secrets), then restart
the API server. The private key must stay server-side and must never use a
`VITE_` prefix. See [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) for
the supported formats, size limit, and database migration instructions.
Apply `lib/db/migrations/0004_imagekit_media_assets.sql` to the existing
PostgreSQL database before using the media gallery or registering ImageKit
uploads. Until applied, the media API returns an actionable migration error.

## VYBE creative marketplace

VYBE is a separate creative catalogue for image/video prompts, visual art,
3D, app/game builders, and implemented interactive experiences. It does not
use or change normal TaskBakeAI recipe records. Public VYBE discovery is
disabled in production, including when either launch flag is accidentally set
to `true`. The API public endpoints are closed in production, and production
`/vybe` URLs redirect to the home page. Admins can still manage and preview
content in Admin → VYBE Studio. In local development, set `VYBE_ENABLED=true`
and `VITE_VYBE_ENABLED=true` to enable public discovery; with the frontend flag
off, `/vybe` remains an authenticated, `noindex,nofollow` admin preview that
uses protected admin APIs.

Apply `lib/db/migrations/0006_vybe_creations.sql` and then
`lib/db/migrations/0007_vybe_content.sql` to an existing PostgreSQL database
before using VYBE Studio. Only records in `PUBLISHED` status are returned by
public endpoints when enabled outside production. Interactive records require
a playable HTTPS URL and verification details; no built-in games or engagement
counts are fabricated.

The VYBE Studio CSV tools derive their versioned template from the editable
VYBE schema. Imports support column mapping, dry-run validation, create-only,
update-existing, and upsert strategies, durable job reports, and streamed
exports. Imports remain drafts by default; enabling the explicit published
status option is required to preserve published records. Apply
`lib/db/migrations/0008_vybe_csv_import_jobs.sql` before using import history
and commit endpoints. CSV files are limited to 5 MB and 500 rows.

The recipe `catalogue` field defaults to `TASKBAKE` and scopes admin listing,
summary, CSV import/export, and bulk updates. Apply
`lib/db/migrations/0005_recipe_catalogue.sql` after `0004` to add this support
to an existing PostgreSQL database. These migrations are prepared only and
have not been applied to production.

## CSV taxonomy imports

Apply the migration before running `deploy.ps1`; the script also verifies that
the production audiences endpoint works before it publishes the frontend.

Admin recipe CSV imports create missing categories and audiences from the
spreadsheet. Semicolon-, comma-, pipe-, and newline-separated audience cells
are split into individual audiences, and imported recipes appear under every
assigned audience. Existing recipes retain their primary audience for API and
editor compatibility.

Before deploying this behavior, apply
`lib/db/migrations/0003_recipe_audiences.sql` to the production database. It
creates the recipe-to-audience relation and backfills each existing recipe's
current audience.
