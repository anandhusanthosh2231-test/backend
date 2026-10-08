# Repository Memory – AI Recipes MVP

## 1. Project Conventions & Architecture

* **Monorepo Archetype**: Managed via `pnpm-workspace.yaml`.
* **Database Driver**: Drizzle ORM paired with PostgreSQL.
* **OpenAPI-First Structure**:
  * Contract resides in `lib/api-spec/openapi.yaml`.
  * Generated files (`lib/api-client-react/src/generated/*` and `lib/api-zod/src/generated/*`) should NEVER be edited by hand.
  * Command to update generated layers is `pnpm --filter @workspace/api-spec run codegen`.
* **Deploy Targets**:
  * Frontend App: `artifacts/ai-recipes/` (Vite, React, Tailwind UI, Wouter router).
  * Backend Service: `artifacts/api-server/` (Express App).

## 2. Common Operations

* Run Backend: `pnpm --filter @workspace/api-server run dev`
* Run Seeding (Idempotent): `pnpm --filter @workspace/scripts run seed`
* Schema Updates: `pnpm --filter @workspace/db run push` (development environments only)
* Full Validation: `pnpm run typecheck` followed by `pnpm run build`

## 3. Important Gotchas & Environment Variables

* **Clerk Identity Credentials**: Both local and production environments need:
  * `DATABASE_URL`
  * `CLERK_PUBLISHABLE_KEY`
  * `CLERK_SECRET_KEY`
  * `VITE_CLERK_PUBLISHABLE_KEY`
  * `CLERK_ADMIN_USER_IDS` — a comma-separated list of administrative Clerks allowed to use `/admin` utilities.
* **Vite base paths**: Vite routing references base paths during local vs production distribution.
