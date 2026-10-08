# AI Recipes: Workspace Guidelines & Agent Instructions

This repository contains **AI Recipes**, an Indian-first library of practical, tested AI workflows.

---

## 1. Project Architecture

The workspace is a monorepo managed under **pnpm** and consists of the following boundaries:

* **Frontend [artifacts/ai-recipes/](artifacts/ai-recipes/)**: Static React (Vite) single-page application.
* **Backend API [artifacts/api-server/](artifacts/api-server/)**: Node.js/Express v5 application using PostgreSQL and Drizzle ORM.
* **Database Lib [lib/db/](lib/db/)**: Schema-definition and migrations using Drizzle.
* **API Specification [lib/api-spec/](lib/api-spec/)**: Source of truth OpenAPI schema.
* **Shared API Clients**:
  * [lib/api-client-react/](lib/api-client-react/): Auto-generated React Query hooks.
  * [lib/api-zod/](lib/api-zod/): Auto-generated Zod validation schemas.

---

## 2. Core Conventions & Workflows

### Contract-First API Development (CRITICAL)
* Never manually modify files inside `generated/` folders (under [lib/api-client-react/src/generated/](lib/api-client-react/src/generated/) or [lib/api-zod/src/generated/](lib/api-zod/src/generated/)).
* To make changes to the API contract:
  1. Modify the OpenAPI schema in [lib/api-spec/openapi.yaml](lib/api-spec/openapi.yaml).
  2. Regenerate code-assets by running:
     ```bash
     pnpm --filter @workspace/api-spec run codegen
     ```

### Database Schema & Seed
* Primary tables live in [lib/db/src/schema/recipes.ts](lib/db/src/schema/recipes.ts).
* The dev database seeding is idempotent by slug under [scripts/src/seed.ts](scripts/src/seed.ts). Running seed won't result in duplicate records.

### Authentication & Authorization
* Public routes do not require login.
* Member activities (saving bookmarks, history) require a valid Clerk account.
* Admin controls (/admin/*) require server-side verification using the clerk user ID against the comma-separated `CLERK_ADMIN_USER_IDS` environment variable.

---

## 3. Operations & Script Reference

| Task | Command | Directory / Workspace Filter |
| :--- | :--- | :--- |
| **Run API Dev Server** | `pnpm --filter @workspace/api-server run dev` | Workspace-level |
| **Register API Codegen**| `pnpm --filter @workspace/api-spec run codegen` | Workspace-level |
| **Push Database Schemas** | `pnpm --filter @workspace/db run push` | Workspace-level (Dev only) |
| **Database Seeding** | `pnpm --filter @workspace/scripts run seed` | Workspace-level |
| **Full Typecheck** | `pnpm run typecheck` | Root workspace |
| **Full Build** | `pnpm run build` | Root workspace |

---

## 4. Coding Standards

* **React/Vite**: Use TypeScript, Tailwind CSS, and Lucide icons.
* **Drizzle**: Map relations clearly, leverage transaction wrappers when dealing with multiple sequential operations, and run `push` when introducing modifications.
* **Error Handling**: Render boundary fallbacks using standard wrappers (such as `ErrorBoundary` inside [artifacts/ai-recipes/src/App.tsx](artifacts/ai-recipes/src/App.tsx)).
