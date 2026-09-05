# UIGen

## Prerequisites
- Node.js 25+ (CI uses `node-version: "25"`)

## Setup & Commands
- `npm run setup` — install, prisma generate, prisma migrate dev (required first step)
- `npm run dev` — `next dev --turbopack`, opens at http://localhost:3000
- `npm run dev:daemon` — same as `dev` but backgrounds and writes to `logs.txt`
- `npm test` — vitest (jsdom environment)
- `npm run build` / `npm start` — production (`npm run vercel-build` mirrors the Vercel build)
- `npm run lint` — `next lint`
- `npm run test:e2e` / `npm run test:e2e:ui` — Playwright E2E with Chromium; auto-starts dev server locally
- `npm run db:reset` — `prisma migrate reset --force`
- **Never run `npm audit fix`** — dependencies are pinned; audit fix breaks compatibility

## Prisma
- Schema: `prisma/schema.prisma` (PostgreSQL via Neon)
- Generated client: `src/generated/prisma/` (import from `@/generated/prisma`)
- After schema changes: `npx prisma migrate dev --name <name>`
- Requires `DATABASE_URL` pointing to a Neon Postgres instance; `npm run setup` will fail without it

## AI / Chat
- No API key needed: `MockLanguageModel` in `src/lib/provider.ts` returns canned components
- Chat API route: `src/app/api/chat/route.ts` — `ai` SDK `streamText` with tools; rate-limited to 30 requests/min/IP; `maxDuration = 120` for Vercel serverless
- Provider selection, free-model allowlists, fallback rotation, step/token limits, message compaction, VFS caching, and error surfacing: **see the `ai-chat` skill**

## Key Architecture
- **Virtual file system** (`src/lib/file-system.ts`): in-memory, never writes to real FS. Serialized to/from project data. Commands mirror Claude Code's str_replace_editor pattern.
- **Preview**: `src/lib/transform/jsx-transformer.ts` — Babel standalone transpiles → blob URLs → import map (esm.sh CDN) → iframe srcdoc with Tailwind CSS CDN
- **Auth**: Neon Auth (`@neondatabase/auth`), `src/lib/auth.ts` + `src/lib/auth/server.ts`. Cookie name: `__Secure-neon-auth.session_token`. Middleware protects `/api/projects` and `/api/filesystem`
- **Sign-in**: Google-only, no email/password or sign-up. Header "Sign In" redirects to Google OAuth via `authClient.signIn.social` in `src/hooks/use-auth.ts`; `signOut`/`getUser` live in `src/actions/index.ts`. Email/password must stay disabled on the Neon Auth gateway
- **Component structure (left→right)**: Chat panel (35%) | Preview/Code tabs (65%). Code view splits further into FileTree (30%) + Monaco editor (70%)
- **Path aliases**: `@/` → `./src/*`, `@/components/ui` for shadcn, `@/lib/utils` for `cn()` helper

## Important Constraints
- **Node 25+ SSR fix**: `node-compat.cjs` loaded in `next.config.ts` deletes `localStorage`/`sessionStorage` globals on server — do not remove (this is why Node 25 is required)
- **Anonymous users**: Work stored in `sessionStorage` via `src/lib/anon-work-tracker.ts`. On Google sign-in, `src/app/main-content.tsx` migrates it into a project and clears it
- **`server-only`**: `src/lib/auth.ts` imports `server-only` — never import it in client components
- **shadcn/ui**: New York style, `components.json` at root. Existing UI components in `src/components/ui/`
- **CSS**: Tailwind v4 with `@import "tailwindcss"` syntax (not v3 config file). Uses `@tailwindcss/typography` plugin and `tw-animate-css`
- **Required env vars**: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` — app and `npm run setup` fail without them. See `.example.env` for all vars.

## Observability
- **Structured logging**: `src/lib/observability/logger.ts` — leveled JSON-line logger + `requestId`/`hashIp` helpers. Used in `/api/chat`, server actions, error boundaries, and the preview. Do not add raw `console.error` in new code; use `logger`.
- **Health endpoint**: `GET /api/health` → `200 {status:"ok"}` or `503 {status:"degraded"}` (does `SELECT 1` against Postgres). Use for uptime checks.
- **Sentry** (`@sentry/nextjs`): config in `sentry.server.config.ts`, `sentry.edge.config.ts`, `src/instrumentation.ts`, and `src/instrumentation-client.ts` (client — not `sentry.client.config.ts`, which is deprecated under Turbopack). `next.config.ts` wraps with `withSentryConfig`. Requires `SENTRY_DSN` at runtime; `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` for source-map upload at build. Builds succeed without any of them (upload skipped).
- **CSP**: `connect-src` in `next.config.ts` allows `https://*.ingest.sentry.io` for Sentry ingest. If you add other Sentry features (Session Replay, etc.), update it.

## Pre-Commit Verification (REQUIRED)
**Always run before committing significant changes:** the `verify-app` skill — starts the dev server, drives the app with Playwright MCP (send "Create a counter component", confirm Preview + Code tabs render), then stops the server.
**Console errors**: Ignore Monaco CSP font warnings (cosmetic). Fail on runtime errors or blank pages.

## Before Pushing (REQUIRED)
**Always run before `git push`:**
```bash
npm run lint && npm test -- --run && npx tsc --noEmit
```
Fix any failures before pushing. Never push with failing tests. `next lint` and vitest do NOT catch TypeScript errors — the Vercel build (`npm run build` / `vercel-build`) does, so run `npx tsc --noEmit` (or `npm run build`) before pushing.

## Git Workflow
- Run the `git-workflow` skill before branching off `main`, pushing, or creating a PR: sync `main` with `git sync-main`, branch off freshly-synced `main`, and rebase before push.

## Testing
- Vitest config: `vitest.config.mts` — uses `@vitejs/plugin-react` and `vite-tsconfig-paths`
- Run single test file: `npx vitest src/lib/__tests__/file-system.test.ts`
- Tests in `src/lib/__tests__/`, `src/lib/transform/__tests__/`, `src/lib/contexts/__tests__/`, `src/components/chat/__tests__/`
- Known: `.opencode/node_modules/zod` tests fail (missing deps) — these are pre-existing and unrelated to project code
