# AI Recipes - Codebase Setup & Architecture Outline

This document serves as a comprehensive guide for AI models (and developers) to understand how the AI-Recipes-MVP codebase is structured, what technologies are used, and where to make changes.

## 1. High-Level Architecture
This is a **pnpm monorepo** containing two main artifacts (applications) and several shared libraries. 
- **Frontend**: A React single-page application built with Vite.
- **Backend**: An Express.js REST API server.
- **Database**: PostgreSQL accessed via Drizzle ORM.
- **Authentication**: Clerk (used for both frontend auth state and backend route protection).

The architecture is API-first. The OpenAPI spec is the source of truth, and React Query hooks/Zod schemas are generated from it.

## 2. Directory Structure

```text
/
├── artifacts/
│   ├── ai-recipes/      # Frontend React application (Vite)
│   └── api-server/      # Backend Express application
├── lib/
│   ├── api-client-react/# Generated React Query hooks (from OpenAPI spec)
│   ├── api-spec/        # OpenAPI YAML specification (Source of truth)
│   ├── api-zod/         # Generated Zod schemas (from OpenAPI spec)
│   └── db/              # Database schema, migrations, and Drizzle config
└── scripts/             # Utility scripts (e.g., database seeding)
```

## 3. Tech Stack

### Frontend (`artifacts/ai-recipes`)
- **Framework**: React 19, Vite
- **Routing**: `wouter`
- **Styling**: Tailwind CSS v4, Radix UI primitives, `lucide-react` for icons
- **State/Data Fetching**: `@tanstack/react-query` (via auto-generated hooks from OpenAPI)
- **Forms**: `react-hook-form` + `zod`
- **Animation**: `framer-motion`
- **Auth**: `@clerk/react`

### Backend (`artifacts/api-server`)
- **Framework**: Express.js 5
- **Language**: Node.js, TypeScript
- **Auth Middleware**: `@clerk/express`
- **Logging**: `pino` and `pino-http`

### Database & Validation (`lib/db`, `lib/api-zod`)
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM (`drizzle-orm`, `drizzle-kit`)
- **Validation**: Zod (with `drizzle-zod` for DB schema translation)

## 4. Where to Make Changes

### Changing the Database Schema
1. Modify `lib/db/src/schema/recipes.ts` (or create new files and export in `index.ts`).
2. Run `pnpm --filter @workspace/db run push` to sync changes to the local development DB.

### Changing the API Contract
1. Modify the OpenAPI spec in `lib/api-spec/openapi.yaml`.
2. Run `pnpm --filter @workspace/api-spec run codegen` to regenerate the Zod schemas and React Query hooks.
3. Update the backend route handlers in `artifacts/api-server/src/routes/` to fulfill the new contract.
4. Update the frontend in `artifacts/ai-recipes/src/` to use the newly generated hooks.

### Modifying the Frontend UI
- Most route-level views are located in `artifacts/ai-recipes/src/App.tsx` (which is quite large and centralized).
- Look in `artifacts/ai-recipes/src/components/` for shared UI components.

### Modifying Backend Logic
- API routes are located in `artifacts/api-server/src/routes/` (e.g., `recipes.ts`, `admin-auth.ts`).
- Middleware (like auth checks) is in `artifacts/api-server/src/middlewares/`.

## 5. Environment & Secrets
The project relies on `.env` and `.env.local` files for configuration.
Required secrets for production/development:
- `DATABASE_URL`: PostgreSQL connection string.
- `CLERK_PUBLISHABLE_KEY` & `CLERK_SECRET_KEY`: Backend Clerk keys.
- `VITE_CLERK_PUBLISHABLE_KEY`: Frontend Clerk key.
- `CLERK_ADMIN_USER_IDS`: Comma-separated list of Clerk user IDs authorized to access `/admin` routes.

## 6. Common Commands
- **Start Backend**: `pnpm --filter @workspace/api-server run dev`
- **Start Frontend**: `pnpm --filter @workspace/ai-recipes run dev` (or use the root `dev` script to run both).
- **Typecheck**: `pnpm run typecheck`
- **Regenerate API Clients**: `pnpm --filter @workspace/api-spec run codegen`
- **Seed Database**: `pnpm --filter @workspace/scripts run seed`

## 7. Important Design Decisions
- **AI-Provider Agnostic**: The application itself does not call OpenAI/Anthropic directly. Users copy tested prompts/workflows from this site into their own AI tools.
- **Generated Clients**: The frontend does *not* use hand-written `fetch` calls. It strictly uses the `@workspace/api-client-react` generated from the OpenAPI spec.
- **Admin Access**: Admin authorization is strictly server-side (allowlist via env vars) and never inferred solely from frontend state.
