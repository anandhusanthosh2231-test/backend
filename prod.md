# AI Recipes MVP — Production Readiness Audit

> **Audit Date:** 2026-09-14  
> **Auditor:** Automated deep-code analysis  
> **Repository:** `AI-Recipes-MVP` (pnpm monorepo)  
> **Stack:** Express 5 + React 19 + Drizzle ORM + Neon Postgres + Clerk Auth, deployed on Replit

---

## Executive Summary

| Metric | Value |
| :--- | :--- |
| **Production Readiness** | ❌ **NOT READY** |
| **Overall Risk** | 🟠 **HIGH** |
| **Estimated Production Cost** | **~$5–$15 USD/month minimum** (Replit deployment is NOT free) |
| **Critical Issues** | 4 |
| **High Issues** | 7 |
| **Medium Issues** | 8 |
| **Low Issues** | 4 |

**Bottom line:** The application has a solid functional foundation — well-structured API, proper Zod validation on most routes, structured logging with Pino, and good supply-chain defenses in `pnpm-workspace.yaml`. However, **4 critical and 7 high-severity issues** prevent safe production deployment. The most urgent are: **secrets on disk without gitignore protection**, a **hardcoded default admin password**, **in-memory auth state that is lost on every restart**, and **CORS wide-open to all origins**. The app **cannot be deployed at ₹0/\$0** because Replit requires payment for production hosting.

---

## Critical Issues

| # | Severity | File | Line(s) | Issue | Why It Matters | Fix |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| C1 | **CRITICAL** | [`.env`](file:///c:/Users/91790/Desktop/Trilogenix/Recipe%20Prompt/AI-Recipes-MVP/.env), [`.env.local`](file:///c:/Users/91790/Desktop/Trilogenix/Recipe%20Prompt/AI-Recipes-MVP/.env.local), [`ai-recipes/.env.local`](file:///c:/Users/91790/Desktop/Trilogenix/Recipe%20Prompt/AI-Recipes-MVP/artifacts/ai-recipes/.env.local) | All | **Live secrets on disk, NOT gitignored** | `.env` and `.env.local` contain real `DATABASE_URL` (with password `npg_Jiy2Smb8sCwd`), `CLERK_SECRET_KEY` (`sk_test_...`), and Clerk publishable keys. The [`.gitignore`](file:///c:/Users/91790/Desktop/Trilogenix/Recipe%20Prompt/AI-Recipes-MVP/.gitignore) does NOT include `.env` or `.env.local` patterns. Although these files happen to be untracked today, a single `git add .` will commit every secret to version history permanently. | **Immediately** add `.env`, `.env.local`, and `*.env.local` to `.gitignore`. Rotate every exposed credential: Neon DB password, Clerk secret key. Audit git history (`git log --all -p -- ".env*"`) to confirm no prior commits. |
| C2 | **CRITICAL** | [`services/admin-auth.ts`](file:///c:/Users/91790/Desktop/Trilogenix/Recipe%20Prompt/AI-Recipes-MVP/artifacts/api-server/src/services/admin-auth.ts) | 44 | **Hardcoded default admin password** | If `ADMIN_INITIAL_PASSWORD` env var is not set, the admin password defaults to the string `"Admin@2025"`. Any attacker who reads the source code (it's on GitHub/Replit) can log into the admin panel. | Remove the fallback. Require `ADMIN_INITIAL_PASSWORD` via env var and crash at startup if it's missing. Enforce minimum 12-char password with mixed case, digits, and symbols. |
| C3 | **CRITICAL** | [`services/admin-auth.ts`](file:///c:/Users/91790/Desktop/Trilogenix/Recipe%20Prompt/AI-Recipes-MVP/artifacts/api-server/src/services/admin-auth.ts) | 36-59 | **Entire admin auth state is in-memory** | Admin password hash, MFA settings, TOTP secret, active sessions, pending MFA challenges, and rate-limit counters are stored in JavaScript `Map` objects inside a singleton class. Every server restart (deploy, crash, autoscale) resets the admin password to the default, regenerates the TOTP secret (breaking any paired authenticator app), and destroys all active sessions. | Persist admin credentials, TOTP secrets, and session tokens in the Neon Postgres database. Use a `admin_users` table with hashed passwords and a `admin_sessions` table. |
| C4 | **CRITICAL** | [`ai-recipes/.env.local`](file:///c:/Users/91790/Desktop/Trilogenix/Recipe%20Prompt/AI-Recipes-MVP/artifacts/ai-recipes/.env.local) | 2 | **Backend secret key in frontend directory** | `CLERK_SECRET_KEY=sk_test_...` is present in the frontend app's `.env.local`. While Vite only bundles `VITE_`-prefixed vars, placing a backend secret in a frontend directory creates a high risk of accidental exposure through misconfigured builds, CI pipelines, or developer error. | Remove `CLERK_SECRET_KEY` from all frontend env files. It belongs exclusively in the API server's environment. |

---

## High Severity Issues

| # | Severity | File | Line(s) | Issue | Why It Matters | Fix |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| H1 | **HIGH** | [`app.ts`](file:///c:/Users/91790/Desktop/Trilogenix/Recipe%20Prompt/AI-Recipes-MVP/artifacts/api-server/src/app.ts) | 35 | **CORS allows all origins** | `app.use(cors())` with no configuration permits any website to make authenticated API requests. Combined with cookie-based Clerk sessions, this enables CSRF-like cross-origin attacks. | Configure `cors({ origin: ['https://your-production-domain.replit.app'], credentials: true })`. |
| H2 | **HIGH** | [`app.ts`](file:///c:/Users/91790/Desktop/Trilogenix/Recipe%20Prompt/AI-Recipes-MVP/artifacts/api-server/src/app.ts) | N/A | **No global error handler** | Express 5 catches async rejections, but without an explicit error-handling middleware, unhandled errors return HTML stack traces to clients, leaking internal paths, dependency versions, and server state. | Add a final middleware: `app.use((err, req, res, next) => { logger.error(err); res.status(500).json({ error: 'Internal Server Error' }); });` |
| H3 | **HIGH** | [`custom-fetch.ts`](file:///c:/Users/91790/Desktop/Trilogenix/Recipe%20Prompt/AI-Recipes-MVP/lib/api-client-react/src/custom-fetch.ts) | 91-99 | **Admin tokens stored in localStorage** | `ai_recipes_admin_token` and `ai_recipes_admin_key` are stored in `window.localStorage` and automatically attached to every API request. Any XSS vulnerability gives an attacker full admin access. | Migrate to `HttpOnly`, `Secure`, `SameSite=Strict` cookies for admin session tokens. |
| H4 | **HIGH** | [`db/package.json`](file:///c:/Users/91790/Desktop/Trilogenix/Recipe%20Prompt/AI-Recipes-MVP/lib/db/package.json) | 11-12 | **No migration strategy** | Schema changes use `drizzle-kit push` (interactive, destructive). In production, this can drop columns, lose data, or cause downtime. There are no versioned SQL migration files. | Switch to `drizzle-kit generate` to create SQL migration files, then use `drizzle-orm/migrator` to apply them programmatically during deployment. |
| H5 | **HIGH** | [`App.tsx`](file:///c:/Users/91790/Desktop/Trilogenix/Recipe%20Prompt/AI-Recipes-MVP/artifacts/ai-recipes/src/App.tsx) | 1-3174 | **159KB monolith file with zero code splitting** | The entire frontend — all routes, pages, components, and inline data — lives in a single 3,200-line `App.tsx`. No `React.lazy()` or dynamic imports exist. Every visitor downloads the full admin panel, all pages, and all component logic on first load. | Split into per-route modules. Use `React.lazy()` + `<Suspense>` for route-level code splitting. Extract admin panel into a lazy-loaded route group. |
| H6 | **HIGH** | [`App.tsx`](file:///c:/Users/91790/Desktop/Trilogenix/Recipe%20Prompt/AI-Recipes-MVP/artifacts/ai-recipes/src/App.tsx) | 442, 714 | **Custom admin auth system bypasses Clerk** | The app has a full custom admin login with username/password/MFA/passkey, running alongside Clerk for regular users. This dual-auth system doubles the attack surface and is harder to audit, monitor, and maintain. | Unify under Clerk. Use Clerk's RBAC (roles/permissions) to designate admin users. Remove the custom admin auth service entirely. |
| H7 | **HIGH** | [`middlewares/auth.ts`](file:///c:/Users/91790/Desktop/Trilogenix/Recipe%20Prompt/AI-Recipes-MVP/artifacts/api-server/src/middlewares/auth.ts) | 32-37, 62-68 | **`ADMIN_SECRET_KEY` acts as a permanent backdoor** | If `ADMIN_SECRET_KEY` env var is set, anyone who knows it bypasses both Clerk authentication and the admin login flow entirely — no MFA, no session, no rate limiting. The key never expires or rotates. | Remove the master passkey bypass. If an emergency access mechanism is needed, implement it with a time-limited, single-use recovery token stored in the database with audit logging. |

---

## Medium Severity Issues

| # | Severity | File | Line(s) | Issue | Why It Matters | Fix |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| M1 | **MEDIUM** | [`recipes.ts`](file:///c:/Users/91790/Desktop/Trilogenix/Recipe%20Prompt/AI-Recipes-MVP/artifacts/api-server/src/routes/recipes.ts) | 113-123 | **Zod validation result discarded** | `ListRecipesQueryParams.safeParse()` is called but the result is thrown away (`void parsed`). Query params are manually re-parsed from `req.query` with unsafe `Number()` coercions, which can produce `NaN` values in SQL `LIMIT`/`OFFSET`. | Use `parsed.data` for all query parameters. Return 400 early if `!parsed.success`. |
| M2 | **MEDIUM** | [`recipes.ts`](file:///c:/Users/91790/Desktop/Trilogenix/Recipe%20Prompt/AI-Recipes-MVP/artifacts/api-server/src/routes/recipes.ts) | 207-230 | **Heavy uncached queries on `/api/home`** | The homepage endpoint fires 5 concurrent database queries including `GROUP BY` aggregations and multi-table sorts on every single request. A traffic spike will overwhelm the database connection pool. | Add in-memory caching with a TTL (e.g., 60s) for `/home`, `/categories`, `/audiences` responses. Consider a Redis layer for multi-instance deployments. |
| M3 | **MEDIUM** | All public routes | Global | **No rate limiting** | Public endpoints (`/recipes`, `/home`, `/feedback`, `/suggestions`, `/submissions`, `/events`) accept unlimited requests. Automated scrapers or malicious actors can flood the database with writes or exhaust Neon compute hours. | Add `express-rate-limit` middleware. Suggested limits: 100 req/min for reads, 10 req/min for writes (feedback, suggestions, submissions). |
| M4 | **MEDIUM** | [`db/src/index.ts`](file:///c:/Users/91790/Desktop/Trilogenix/Recipe%20Prompt/AI-Recipes-MVP/lib/db/src/index.ts) | 13 | **Unconfigured connection pool** | `new Pool({ connectionString })` uses `pg`'s default of 10 max connections with no idle timeout or connection timeout. Traffic spikes can exhaust all connections; idle connections can prevent Neon from scaling to zero. | Configure explicitly: `new Pool({ connectionString, max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 })`. |
| M5 | **MEDIUM** | [`schema/recipes.ts`](file:///c:/Users/91790/Desktop/Trilogenix/Recipe%20Prompt/AI-Recipes-MVP/lib/db/src/schema/recipes.ts) | 56 | **No enum constraint on `status`** | The `status` column is plain `text` with no CHECK constraint. Application bugs can insert invalid values like `"drafting"` or `"DELETED"`, causing silent data corruption. | Use `pgEnum('recipe_status', ['DRAFT', 'IDEA', 'TESTING', 'PUBLISHED', 'ARCHIVED'])` or add a `CHECK` constraint. |
| M6 | **MEDIUM** | [`schema/recipes.ts`](file:///c:/Users/91790/Desktop/Trilogenix/Recipe%20Prompt/AI-Recipes-MVP/lib/db/src/schema/recipes.ts) | 72 | **`updatedAt` never auto-updates** | The `updatedAt` column uses `.defaultNow()` but has no `$onUpdate` hook. It's only set at row creation and only manually updated in a few routes. Most update operations leave it stale. | Add `.$onUpdate(() => new Date())` to the column definition, or ensure every `db.update()` call includes `updatedAt: new Date()`. |
| M7 | **MEDIUM** | [`main.tsx`](file:///c:/Users/91790/Desktop/Trilogenix/Recipe%20Prompt/AI-Recipes-MVP/artifacts/ai-recipes/src/main.tsx) | 15 | **Single top-level error boundary** | Only one `<ErrorBoundary>` wraps the entire `<App />`. An error in any minor widget crashes the entire UI and shows a blank fallback screen. | Add per-route or per-section error boundaries. Wrap admin panel, recipe detail pages, and complex widgets individually. |
| M8 | **MEDIUM** | [`admin-auth.ts`](file:///c:/Users/91790/Desktop/Trilogenix/Recipe%20Prompt/AI-Recipes-MVP/artifacts/api-server/src/routes/admin-auth.ts) | 147, 153 | **`/admin/auth/settings` routes missing `requireAuth`** | These routes use `requireAdmin` alone without `requireAuth`. For Clerk-authenticated admin users (not using admin token/passkey), `req.userId` will be `undefined` because `requireAuth` was never called to extract it from the Clerk session. | Chain both middlewares: `requireAuth, requireAdmin` (as done on all other admin routes in `recipes.ts`). |

---

## Low Severity Issues

| # | Severity | File | Line(s) | Issue | Why It Matters | Fix |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| L1 | **LOW** | [`app.ts`](file:///c:/Users/91790/Desktop/Trilogenix/Recipe%20Prompt/AI-Recipes-MVP/artifacts/api-server/src/app.ts) | N/A | **No security headers** | Standard HTTP security headers (`X-Content-Type-Options`, `Strict-Transport-Security`, `X-Frame-Options`, etc.) are not set. | `pnpm add helmet` and add `app.use(helmet())` early in the middleware stack. |
| L2 | **LOW** | [`vite.config.ts`](file:///c:/Users/91790/Desktop/Trilogenix/Recipe%20Prompt/AI-Recipes-MVP/artifacts/ai-recipes/vite.config.ts) | 62, 77 | **`allowedHosts: true`** disables host header validation | Allows DNS rebinding attacks if the dev/preview server is exposed to untrusted networks. | Remove `allowedHosts: true` or restrict to explicit trusted domains. |
| L3 | **LOW** | [`schema/recipes.ts`](file:///c:/Users/91790/Desktop/Trilogenix/Recipe%20Prompt/AI-Recipes-MVP/lib/db/src/schema/recipes.ts) | 89, 102, 127-146 | **No referential integrity for `userId`** | `userId` in events, feedback, saved_recipes, and history tables is a plain text field with no FK or cleanup mechanism. Deleted Clerk users leave orphaned records. | Add a Clerk webhook endpoint to scrub orphaned user data when a user is deleted. |
| L4 | **LOW** | [`App.tsx`](file:///c:/Users/91790/Desktop/Trilogenix/Recipe%20Prompt/AI-Recipes-MVP/artifacts/ai-recipes/src/App.tsx) | Various | **Inconsistent error handling in manual fetch calls** | Admin auth functions use raw `fetch()` with manual `try/catch` while the rest of the app uses React Query. This creates inconsistent loading/error state patterns. | Migrate admin auth API calls to React Query `useMutation`. |

---

## Security Findings Summary

| Finding | Status | Detail |
| :--- | :--- | :--- |
| **SQL Injection** | ✅ Safe | All Drizzle queries use parameterized bindings. No `sql.raw()` usage found. Tagged template `sql` interpolation is properly parameterized. |
| **XSS** | ⚠️ Low Risk | `dangerouslySetInnerHTML` found only in `chart.tsx` (ShadCN component) for CSS injection — values are derived from config, not user input. |
| **CSRF** | ❌ Vulnerable | `cors()` allows all origins. No CSRF tokens. Clerk cookies may be sent cross-origin. |
| **Auth Bypass** | ❌ Vulnerable | `ADMIN_SECRET_KEY` provides permanent, unaudited, unrestricted admin access. Default password `Admin@2025`. |
| **Secret Management** | ❌ Vulnerable | Real credentials in `.env` files that aren't gitignored. Secrets in frontend directory. |
| **Token Storage** | ❌ Vulnerable | Admin tokens in `localStorage` — accessible to any JS (XSS = full admin compromise). |
| **Dependency Supply Chain** | ✅ Strong | `minimumReleaseAge: 1440` enforced. Platform overrides exclude unnecessary binaries. esbuild vulnerability explicitly patched. |
| **HTTP Headers** | ⚠️ Missing | No `helmet`. No `Strict-Transport-Security`, `X-Content-Type-Options`, or `X-Frame-Options`. |
| **Logging & Redaction** | ✅ Good | Pino with redacted `authorization`, `cookie`, and `set-cookie` headers. Structured JSON in production. |

---

## Dependency & Service Cost Analysis

### Service Pricing Matrix

| Service | Free Tier? | Credit Card Required? | Free Limits | Overage Behavior | Monthly Cost if Exceeded |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Neon Postgres** | ✅ Yes | No | 512 MB storage, 100 CU-hours/mo, 10 branches, 1 project | **Hard stop**: compute suspends, writes fail. **No auto-charge.** | Launch plan: $19/mo |
| **Clerk Auth** | ✅ Yes | No | 10,000 MAU, unlimited logins, OAuth, RBAC | **Soft limit**: email alerts, sign-up throttling. No crash. | Pro plan: $25/mo + $0.02/MAU |
| **Replit Hosting** | ❌ **No** | **Yes** | IDE workspace only (sleeps on idle). **No free production deployment.** | **Hard stop**: deployment goes offline at $0 balance. Auto-refill charges card. | Autoscale: ~$5–15/mo. Reserved VM: ~$6–15/mo |

### Can This App Run at ₹0 / $0?

**No.** Replit requires payment for production deployments. The `.replit` config specifies `deploymentTarget = "autoscale"`, which bills per vCPU-second and RAM-second.

### Free Deployment Architecture (if switching from Replit)

To achieve true ₹0/\$0 deployment, migrate hosting away from Replit:

| Component | Free Alternative | Free Tier Limits |
| :--- | :--- | :--- |
| **Database** | Neon Postgres (keep) | 512 MB, 100 CU-hours/mo |
| **Auth** | Clerk (keep) | 10,000 MAU |
| **API Server** | [Render.com](https://render.com) free tier | 750 hours/mo, sleeps after 15 min idle. No credit card required. |
| **Frontend** | [Cloudflare Pages](https://pages.cloudflare.com) or [Vercel](https://vercel.com) free tier | Unlimited static sites, 100 GB bandwidth/mo |
| **Alternative** | [Railway.app](https://railway.app) free tier | $5/mo free credit, no credit card. 512 MB RAM, shared CPU. |

> [!WARNING]
> Switching from Replit to Render/Vercel requires removing Replit-specific plugins (`@replit/vite-plugin-cartographer`, `@replit/vite-plugin-dev-banner`, `@replit/vite-plugin-runtime-error-modal`) and the Clerk proxy middleware (which was built specifically for Replit's Cloud Run edge). These are already conditionally loaded in non-Replit environments, so the migration is straightforward.

### Neon Free Tier Risk Factors

| Risk | Likelihood | Impact |
| :--- | :--- | :--- |
| Events table growth exceeds 512 MB | Medium (unbounded inserts on every page view) | Writes fail, site breaks |
| 100 CU-hours exhausted under traffic | Low-Medium (scale-to-zero after 5 min helps) | DB suspends, all queries fail |
| Connection pool keepalive prevents scale-to-zero | Medium (no idle timeout configured) | Wastes compute hours |

### Clerk Free Tier Risk Factors

| Risk | Likelihood | Impact |
| :--- | :--- | :--- |
| Exceeding 10,000 MAU | Low (early MVP) | Sign-up throttling, email warning |
| SMS pumping if SMS verification enabled | N/A (not currently enabled) | Could cost thousands |

---

## Required Environment Variables

| Variable | Required? | Used By | Sensitive? | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `DATABASE_URL` | ✅ Yes | API Server, DB lib | 🔴 Yes | Neon pooled connection string. Server crashes at startup without it. |
| `DATABASE_URL_UNPOOLED` | ❌ No | Migrations only | 🔴 Yes | Direct (non-pooled) Neon connection. Needed for `drizzle-kit push`. |
| `CLERK_PUBLISHABLE_KEY` | ✅ Yes | API Server | 🟡 Public | Clerk frontend publishable key. |
| `CLERK_SECRET_KEY` | ✅ Yes | API Server | 🔴 Yes | Clerk backend secret. Server likely fails auth without it. |
| `VITE_CLERK_PUBLISHABLE_KEY` | ✅ Yes | Frontend (Vite) | 🟡 Public | Same value as `CLERK_PUBLISHABLE_KEY`, exposed to client bundle. |
| `CLERK_ADMIN_USER_IDS` | ✅ Yes | API Server | 🟡 Semi | Comma-separated Clerk user IDs for admin access. |
| `PORT` | ❌ Optional | API Server | No | Defaults to `5000`. Replit sets this automatically. |
| `BASE_PATH` | ❌ Optional | Frontend | No | Defaults to `/`. |
| `NODE_ENV` | ❌ Optional | Both | No | Set to `production` for prod. Controls Clerk proxy, logging format, and Vite plugins. |
| `ADMIN_SECRET_KEY` | ❌ Optional | API Server | 🔴 Yes | Master admin bypass key. **Dangerous — see H7.** |
| `ADMIN_INITIAL_PASSWORD` | ⚠️ Should be required | API Server | 🔴 Yes | Falls back to `Admin@2025` if unset. **Must be set — see C2.** |
| `ADMIN_INITIAL_USERNAME` | ❌ Optional | API Server | 🟡 Semi | Defaults to `admin`. |
| `ADMIN_CONTACT_PHONE` | ❌ Optional | API Server | 🟡 Semi | Used for MFA OTP display. Defaults to `+91 9876543210`. |
| `LOG_LEVEL` | ❌ Optional | API Server | No | Pino log level. Defaults to `info`. |
| `NEON_BRANCH` | ❌ Optional | Neon config | No | Currently set to `production`. |

---

## Deployment Prerequisites

1. **Neon Postgres project** provisioned with a database
2. **Clerk application** created with desired OAuth providers configured
3. **Replit account** with active billing (Cycles or Core subscription) — OR — alternative hosting platform
4. **Node.js ≥ 24** (specified in `.replit` as `nodejs-24`)
5. **pnpm** package manager (enforced via preinstall script)
6. Database seeded with categories, audiences, and initial recipes

---

## Exact Deployment Steps

### On Replit (Current Architecture)

```bash
# 1. Set all secrets in Replit Secrets panel (NOT in .env files):
#    DATABASE_URL, DATABASE_URL_UNPOOLED, CLERK_SECRET_KEY,
#    CLERK_PUBLISHABLE_KEY, VITE_CLERK_PUBLISHABLE_KEY,
#    CLERK_ADMIN_USER_IDS, ADMIN_INITIAL_PASSWORD, NODE_ENV=production

# 2. Install dependencies
pnpm install

# 3. Push database schema (first-time only — replace with migrations before prod)
cd lib/db
pnpm run push
cd ../..

# 4. Seed initial data (first-time only)
cd scripts
pnpm tsx src/seed.ts
cd ..

# 5. Build everything
pnpm run build

# 6. The .replit file handles deployment:
#    - deploymentTarget = "autoscale"
#    - postBuild runs "pnpm store prune"
#    - Entry point: artifacts/api-server/dist/index.mjs
#    - Frontend served as static files from artifacts/ai-recipes/dist/public/

# 7. Deploy via Replit UI "Deploy" button
```

### On Render.com (Free Alternative)

```bash
# 1. Create a Render Web Service pointing to the GitHub repo

# 2. Set environment variables in Render dashboard:
#    DATABASE_URL, CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY,
#    VITE_CLERK_PUBLISHABLE_KEY, CLERK_ADMIN_USER_IDS,
#    ADMIN_INITIAL_PASSWORD, NODE_ENV=production, PORT=10000

# 3. Build command:
pnpm install && pnpm run build

# 4. Start command:
node --enable-source-maps artifacts/api-server/dist/index.mjs

# 5. Push DB schema (run once from local machine with DATABASE_URL set):
cd lib/db && pnpm run push

# 6. Seed data (run once from local machine):
cd scripts && pnpm tsx src/seed.ts
```

---

## Post-Deployment Checks

| Check | Command / URL | Expected Result |
| :--- | :--- | :--- |
| Health endpoint | `GET /api/healthz` | `{ "status": "ok" }` |
| Homepage loads | Visit `/` in browser | React app renders, recipes load |
| API returns recipes | `GET /api/recipes` | JSON array with `items`, `page`, `total` |
| Clerk auth works | Click Sign In button | Clerk modal opens, OAuth/email login works |
| Admin panel access | Navigate to `/admin` | Login form appears (or admin dashboard if authenticated) |
| Database connectivity | Check server logs for startup | No `DATABASE_URL must be set` errors |
| HTTPS enforced | Visit production URL | Browser shows padlock, no mixed content warnings |
| Static assets cached | Check `Cache-Control` headers on JS/CSS | Vite-hashed filenames with long cache TTL |

---

## Monitoring & Logging Recommendations

| Area | Current State | Recommendation |
| :--- | :--- | :--- |
| **Application Logs** | ✅ Pino (structured JSON in prod, pretty in dev) | Good. Add log aggregation (e.g., Grafana Cloud free tier: 50 GB logs/mo) to persist logs beyond container lifecycle. |
| **Error Tracking** | ❌ None | Add Sentry (free tier: 5K errors/mo) or BetterStack for crash alerts. |
| **Uptime Monitoring** | ❌ None | Add UptimeRobot (free: 50 monitors, 5-min interval) pointing at `/api/healthz`. |
| **Database Monitoring** | ⚠️ Neon dashboard only | Monitor storage usage approaching 512 MB. Set Neon email alerts for compute hour usage. |
| **Performance** | ❌ None | Add basic response time logging. Pino-http already logs request duration — forward to a dashboard. |
| **Security Alerts** | ❌ None | Enable GitHub Dependabot alerts. Run `pnpm audit` in CI. |
| **Clerk Dashboard** | ✅ Built-in | Monitor MAU count approaching 10,000. |

---

## Rollback Plan

### Database Rollback
- **Neon instant restore**: Free tier includes 24-hour point-in-time recovery. Use `neon branches restore` to revert to any point in the last 24 hours.
- **Before any schema change**: Create a Neon branch as a snapshot: `neon branches create --name pre-migration-backup`.
- **No migration files exist** (only `drizzle-kit push`), so there is currently **no way to roll back schema changes programmatically**. This is a **critical gap** — see H4.

### Application Rollback
- **Replit**: Use Replit's deployment history to roll back to a previous deployment version.
- **Render/Vercel**: Roll back via the hosting dashboard to any previous deploy.
- **Git**: `git revert <commit>` or `git reset --hard <commit>` to restore the previous application state, then redeploy.

### Emergency Procedures
1. **Database connection failure**: Check Neon dashboard for compute suspension (free tier limit). If suspended, wait for monthly reset or upgrade to Launch plan.
2. **Auth failure**: Verify `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` are correct in production secrets. Check Clerk dashboard for service incidents.
3. **Complete outage**: Restart the deployment. If database is healthy but app won't start, check for missing env vars (server crashes immediately without `DATABASE_URL`).

---

## Items Requiring Verification

| Item | Why |
| :--- | :--- |
| **Git history for leaked secrets** | `.env` files aren't gitignored. Must verify no prior commits exposed them. Run `git log --all -p -- "*.env*"` on the full repo history. |
| **Neon database current storage usage** | If approaching 512 MB, the events table (unbounded inserts on every page view) may need cleanup or archival. |
| **Clerk application mode** | Current keys use `pk_test_` / `sk_test_` prefixes, indicating a **development instance**. Production Clerk requires creating a production instance with `pk_live_` / `sk_live_` keys. |
| **`ADMIN_SECRET_KEY` env var status** | If set in production, any holder has permanent unaudited admin access. Verify whether it's configured and consider removing it. |
| **Replit billing status** | Confirm active Cycles balance or Core subscription before deploying. Deployment fails silently without credits. |
| **Domain / DNS** | No custom domain configuration found. Production URL will be `*.replit.app` unless configured. |

---

## Priority Fix Order

If preparing for production deployment, fix issues in this order:

1. **C1** — Add `.env*` to `.gitignore` and rotate all credentials (30 minutes)
2. **C2** — Remove hardcoded default password, require env var (15 minutes)
3. **C4** — Remove `CLERK_SECRET_KEY` from frontend `.env.local` (5 minutes)
4. **H1** — Configure CORS with specific origins (10 minutes)
5. **H2** — Add global error handler (10 minutes)
6. **L1** — Add `helmet` for security headers (10 minutes)
7. **M3** — Add rate limiting to public endpoints (30 minutes)
8. **M4** — Configure connection pool (5 minutes)
9. **H4** — Set up proper migration workflow (1 hour)
10. **C3/H6** — Migrate admin auth to database or unify under Clerk (4-8 hours)
11. **H3** — Move admin tokens to HttpOnly cookies (2 hours)
12. **H5** — Split App.tsx and add code splitting (4-8 hours)

> **Estimated effort to reach production-ready state: 2-3 days of focused work.**
