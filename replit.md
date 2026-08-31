# AI Recipes

AI Recipes is an Indian-first library of practical, tested AI workflows for real work, study, business, and everyday communication.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server on its managed port
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run seed` — seed the development database with the curated recipe library
- Required env: `DATABASE_URL` — Postgres connection string
- Clerk secrets are provisioned through Replit Secrets. Set `CLERK_ADMIN_USER_IDS` to a comma-separated allowlist before using admin endpoints.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/ai-recipes/` — React + Vite product UI and route-level views
- `artifacts/api-server/src/routes/recipes.ts` — public, member, and admin API handlers
- `lib/api-spec/openapi.yaml` — source-of-truth API contract
- `lib/db/src/schema/recipes.ts` — Drizzle schema for recipes, taxonomy, engagement, submissions, and member activity
- `scripts/src/seed.ts` — idempotent development content seed

## Architecture decisions

- V1 is intentionally AI-provider agnostic: users copy tested workflows into the assistant they already use.
- Public browsing and discovery work without an account; Clerk is required only for member activity and admin routes.
- Admin authorization is server-side and allowlist-based through `CLERK_ADMIN_USER_IDS`; it is never inferred from frontend state.
- The frontend consumes generated React Query hooks from the OpenAPI contract rather than hand-written API clients.

## Product

Users can browse, search, filter, read, copy, share, save, and give feedback on tested workflows. They can submit workflows, view saved/history pages after signing in, and admins can manage recipe content, submissions, taxonomy, and analytics.

## User preferences

No project-specific preferences recorded.

## Gotchas

- Regenerate API clients after changing `lib/api-spec/openapi.yaml`; generated files are not hand-edited.
- The web Vite config requires managed `PORT` and `BASE_PATH` values when running a production build.
- Seed data is idempotent by slug, so rerunning it does not duplicate the curated recipes.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
