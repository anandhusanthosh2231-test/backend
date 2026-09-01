# AI Recipes: easiest production implementation

This project is already arranged for the simplest Replit production setup:

- **AI Recipes** is the public React/Vite web artifact.
- **API Server** is the Express/PostgreSQL API artifact.
- Both artifacts live in this workspace and share the same production database and secrets.
- The app does not need an AI provider API. Users copy recipes into the assistant they already use.

## 1. One-time setup

In the Replit workspace, open **Secrets** and add the production values for:

```text
DATABASE_URL
CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
VITE_CLERK_PUBLISHABLE_KEY
CLERK_ADMIN_USER_IDS
```

`CLERK_ADMIN_USER_IDS` is a comma-separated list of Clerk user IDs. Add the ID of each person who should be able to use `/admin`. Never put these values in source code or commit them to Git.

If production secrets are managed from the Publishing settings, add them there too. Development secrets are not automatically the same as production secrets.

## 2. Seed content before publishing

The development database already has the curated starter library. To add the starter recipes again safely:

```bash
pnpm --filter @workspace/scripts run seed
```

The seed is idempotent by recipe slug, so rerunning it does not duplicate the library.

For production, publish after the development database contains the content you want copied into production. Do not run destructive schema or data commands against production as part of a normal content update.

## 3. Fastest publish path

1. Run `pnpm run typecheck`.
2. Run `pnpm run build`.
3. Open the **Publishing** tool in the Replit workspace.
4. Publish the project with the existing artifacts:
   - `AI Recipes`
   - `API Server`
5. Use the default **Autoscale** target. The web artifact is static and the API is stateless; PostgreSQL holds persistent data.
6. Confirm the production environment contains the secrets above.
7. Publish.
8. Open the generated production URL and check:
   - `/`
   - `/recipes`
   - `/api/healthz`
   - sign in
   - `/admin`

Publishing handles the build, hosting, TLS, and health checks. The existing artifact configuration already provides the web build, SPA rewrite, API service, and health check.

## 4. Easiest content workflow

### Public/community submission

Anyone can use the visible **Share workflow** link in the header or the homepage creator panel:

1. Open `/submit`.
2. Enter the workflow title, problem, workflow, and how it was used.
3. Submit it.
4. An admin reviews it in `/admin/submissions`.
5. The admin turns the good submissions into a full recipe in `/admin/recipes/new`.

### Admin recipe entry

1. Sign in with a Clerk account whose user ID is in `CLERK_ADMIN_USER_IDS`.
2. Open `/admin/recipes/new`.
3. Complete the three editor sections:
   - **The idea** — title, slug, problem, category, audience, and language.
   - **The workflow** — inputs, steps, prompt, examples, and refinements.
   - **Trust & discovery** — verification, tools, tags, tested-with metadata, version, and SEO.
4. Enter list values one per line.
5. Save as `DRAFT` while writing.
6. Move to `TESTING` when it needs review.
7. Move to `PUBLISHED` only after checking the prompt with the listed assistant/model.
8. Use the feature switches for Featured, Trending, and Recipe of the Day.

The editor writes directly to PostgreSQL through the authenticated API, so content survives refreshes and deployments.

## 5. Normal content release loop

For routine recipe updates, no code deployment is needed:

1. Sign in as an admin.
2. Edit or duplicate a recipe.
3. Save it as `DRAFT` or `TESTING`.
4. Review the public recipe page.
5. Set status to `PUBLISHED`.

Only use a new code deployment when changing the product UI, API, schema, or seed logic.

## 6. If something is not visible

- Public pages should work without signing in.
- A `401` means the Clerk session is missing.
- A `403` on admin routes means the signed-in Clerk user ID is not in `CLERK_ADMIN_USER_IDS`.
- If the web page loads but recipes do not, check the API service and `/api/healthz`.
- If a production build is missing data, seed the development database first and then publish again.