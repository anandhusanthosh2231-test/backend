# Production deployment plan for AI Recipes

This project is already build-ready. I verified the production build with:

```bash
pnpm run build
```

The workspace compiled successfully for the frontend, mockup site, and API server.

---

## Recommended free production setup

### 1) Frontend hosting: Cloudflare Pages
- Best fit for a Vite React app
- Free tier available
- Works without a Git repository via direct zip upload
- Good for production domains and environment variables

Recommended flow:
1. Run the frontend production build
2. Upload the generated `artifacts/ai-recipes/dist/public` folder
3. Set production environment variables in Cloudflare Pages
4. Bind a custom domain or use the free Pages domain

### 2) Backend hosting: Railway or Fly.io
- Best option for a Node/Express API without a Git repo
- Supports deploy from ZIP or Docker image
- Production-appropriate env secret management
- More product-company-like than ad hoc local hosting

Recommended flow:
1. Build the API: `pnpm --filter @workspace/api-server run build`
2. Deploy the generated `artifacts/api-server/dist` output via Railway or Fly.io
3. Add environment variables for Clerk, Neon, CORS, JWT/session settings
4. Give the API a production domain such as `api.yourdomain.com`

### 3) Database: Neon
- Free tier is enough for early production use
- Branching and safe testing are strong product-grade features
- Use a production branch and a separate dev branch

### 4) Authentication: Clerk
- Already integrated and suitable for production
- Keep separate production and development keys
- Use Google OAuth in the production Clerk app as well

---

## Product-company production model

A real product team typically separates:
- Development: local machine or preview branch
- Staging: a deployed environment from the current release candidate
- Production: the live environment used by users

For this project, the clean structure is:

1. Local development
   - run `pnpm dev`
2. Preview environment
   - generated build deployed to staging host
3. Production environment
   - separate site and API with production secrets and domain

This is not just one live app. It is two live services:
- frontend app
- backend API
- database
- auth provider

That is the standard product architecture.

---

## No-Git deployment path

Because there is no repository, use a direct artifact deployment flow.

### Frontend artifact
```bash
cd "C:\Users\91790\Desktop\Trilogenix\Recipe Prompt\AI-Recipes-MVP"
pnpm --filter @workspace/ai-recipes run build
```

Then upload the contents of:

```text
artifacts/ai-recipes/dist/public
```

to Cloudflare Pages as a direct upload.

### API artifact
```bash
cd "C:\Users\91790\Desktop\Trilogenix\Recipe Prompt\AI-Recipes-MVP"
pnpm --filter @workspace/api-server run build
```

Then deploy the built output from:

```text
artifacts/api-server/dist
```

using Railway/Fly.io with ZIP or Docker deployment.

---

## Required environment variables

Set these in production hosting:

```env
NODE_ENV=production
PORT=5000
CLIENT_URL=https://your-frontend-domain.com
API_URL=https://your-api-domain.com
CLERK_SECRET_KEY=...
CLERK_PUBLISHABLE_KEY=...
CLERK_WEBHOOK_SECRET=...
DATABASE_URL=...
```

Important: keep separate values for dev, staging, and production.

---

## Recommended first production release

For a free, no-repo launch:

- Frontend: Cloudflare Pages (free)
- API: Railway (free starter / limited credits)
- Database: Neon free tier
- Auth: Clerk free for early use
- Domain: Cloudflare custom domain or free subdomain

This is the simplest path that still looks and behaves like a real production product setup.

---

## Production release checklist

Before launch:
- [ ] set production env vars
- [ ] verify API health endpoint
- [ ] verify Clerk sign-in flow in prod
- [ ] verify Google login works
- [ ] test saved/history/profile APIs
- [ ] confirm CORS and domain allowlist
- [ ] set custom domain
- [ ] test a real user flow end-to-end
- [ ] enable error monitoring / logs

---

## Recipe layouts and optional R2 media

Recipe layout mode defaults to `normal`; recipes without layout metadata, including CSV imports, continue using the existing recipe renderer. The layout migration only adds two columns and does not rewrite recipe content:

```sql
ALTER TABLE recipes
   ADD COLUMN IF NOT EXISTS layout_mode text NOT NULL DEFAULT 'normal',
   ADD COLUMN IF NOT EXISTS layout_config jsonb;
```

Apply `lib/db/migrations/0002_recipe_layout.sql` to the production database before deploying the API version that reads the new fields. On development databases, the existing Drizzle `push` workflow can apply the schema change.

R2 image storage is optional. The admin image pickers in Prompt Studio and custom layouts upload directly through the authenticated API; recipes store the resulting public URL in their `guide` JSON. Create an R2 bucket and an S3 API token scoped to that bucket with object read/list/write access. If images should be publicly visible, attach a custom domain to the bucket and use that HTTPS domain as `R2_PUBLIC_BASE_URL`. The API proxies image uploads, so bucket CORS is not needed for browser uploads. Configure these variables on the backend service only:

```env
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...
R2_PUBLIC_BASE_URL=https://media.example.com
R2_MAX_FILE_SIZE_BYTES=8388608
```

Never add R2 credentials to `VITE_` variables or the Cloudflare frontend. Without the R2 settings, recipes and custom layouts remain editable; the image picker reports that storage is unavailable, and existing public image URLs can still be entered manually.

---

## Best next move

If you want a truly product-style production rollout without Git, the best path is:

1. Build the app locally
2. Deploy the frontend to Cloudflare Pages
3. Deploy the API to Railway/Fly.io
4. Attach Neon database and Clerk production keys
5. Connect a custom domain
6. Treat the whole setup as prod, with a separate preview/staging environment later

That gives you a real-world product setup without needing a repository.
