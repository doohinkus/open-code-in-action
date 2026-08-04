# UIGen

## Prerequisites
- Node.js 25+ (CI uses `node-version: "25"`; Node 25's Web Storage API requires the `node-compat.cjs` shim)

## Setup & Commands
- `npm run setup` — install, prisma generate, prisma migrate dev (required first step)
- `npm run dev` — `next dev --turbopack`, opens at http://localhost:3000
- `npm run dev:daemon` — same as `dev` but backgrounds and writes to `logs.txt`
- `npm test` — vitest (jsdom environment)
- `npm run build` / `npm start` — production
- `npm run lint` — `next lint`
- `npm run db:reset` — `prisma migrate reset --force`
- **Never run `npm audit fix`** — dependencies are pinned; audit fix breaks compatibility

## Prisma
- Schema: `prisma/schema.prisma` (PostgreSQL via Neon)
- Generated client: `src/generated/prisma/` (import from `@/generated/prisma`)
- After schema changes: `npx prisma migrate dev --name <name>`
- Requires `DATABASE_URL` pointing to a Neon Postgres instance; `npm run setup` will fail without it

## AI / Chat
- No API key needed: `MockLanguageModel` in `src/lib/provider.ts` returns canned components (4-step limit, counter/form/card)
- Provider priority (highest first): Google Gemini (`GOOGLE_API_KEY`) → OpenAI-compatible (`OPENAI_COMPATIBLE_BASE_URL`/`OPENAI_COMPATIBLE_MODEL`) → Anthropic Claude (`ANTHROPIC_API_KEY`) → Mock fallback
- Chat API route: `src/app/api/chat/route.ts` — uses `ai` SDK `streamText` with tools; rate-limited to 30 requests/min/IP; `maxDuration = 120` for Vercel serverless
- Mock provider uses `maxSteps=4`; real providers use `maxSteps=40` (`route.ts:172`)
- AI tools: `str_replace_editor` (view/create/replace/insert) and `file_manager` (rename/delete) — operate on VirtualFileSystem
- System prompt: `src/lib/prompts/generation.tsx` — requires `/App.jsx` entrypoint, `@/` import alias, Tailwind CSS

## Key Architecture
- **Virtual file system** (`src/lib/file-system.ts`): in-memory, never writes to real FS. Serialized to/from project data. Commands mirror Claude Code's str_replace_editor pattern.
- **Preview**: `src/lib/transform/jsx-transformer.ts` — Babel standalone transpiles → blob URLs → import map (esm.sh CDN) → iframe srcdoc with Tailwind CSS CDN
- **Auth**: Neon Auth (`@neondatabase/auth`), `src/lib/auth.ts` + `src/lib/auth/server.ts`. Cookie name: `__Secure-neon-auth.session_token`. Middleware protects `/api/projects` and `/api/filesystem`
- **Sign-in**: Google-only, no email/password or sign-up. Header "Sign In" redirects to Google OAuth via `authClient.signIn.social` in `src/hooks/use-auth.ts`; `signOut`/`getUser` live in `src/actions/index.ts`. Email/password must stay disabled on the Neon Auth gateway
- **Component structure (left→right)**: Chat panel (35%) | Preview/Code tabs (65%). Code view splits further into FileTree (30%) + Monaco editor (70%)
- **Path aliases**: `@/` → `./src/*`, `@/components/ui` for shadcn, `@/lib/utils` for `cn()` helper

## Important Constraints
- **Node 25+ SSR fix**: `node-compat.cjs` loaded in `next.config.ts` deletes `localStorage`/`sessionStorage` globals on server — do not remove
- **Anonymous users**: Work stored in `sessionStorage` via `src/lib/anon-work-tracker.ts`. On Google sign-in, `src/app/main-content.tsx` migrates it into a project and clears it
- **`server-only`**: `src/lib/auth.ts` imports `server-only` — never import it in client components
- **shadcn/ui**: New York style, `components.json` at root. Existing UI components in `src/components/ui/`
- **CSS**: Tailwind v4 with `@import "tailwindcss"` syntax (not v3 config file). Uses `@tailwindcss/typography` plugin and `tw-animate-css`
- **Required env vars**: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` — app and `npm run setup` fail without them. See `.example.env` for all vars.

## Pre-Commit Verification (REQUIRED)
**Always run before committing significant changes:**

1. Start dev server: `npx next dev --turbopack > /tmp/uigen-dev.log 2>&1 &` (use `npx` directly — `npm run dev` hangs)
2. Wait for server, verify with: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` (should return `200`)
3. Navigate to `http://localhost:3000` with Playwright MCP
4. Verify page loads (title, chat input, preview/code tabs visible)
5. Send a test message: type "Create a counter component" and press Enter
6. Confirm provider responds (mock: "Creating /App.jsx"; real: actual AI-generated text + tool calls)
7. Check Preview tab: Counter component renders with Decrement/Reset/Increment buttons
8. Check Code tab: File tree shows `App.jsx`, Monaco editor displays React code
9. Close browser and stop dev server: `pkill -f "next dev"`

**Console errors**: Ignore Monaco CSP font warnings (cosmetic). Fail on runtime errors or blank pages.

## Before Pushing (REQUIRED)
**Always run before `git push`:**
```bash
npm run lint && npm test -- --run && npx tsc --noEmit
```
Fix any failures before pushing. Never push with failing tests. `next lint` and vitest do NOT catch TypeScript errors — the Vercel build (`npm run build` / `vercel-build`) does, so run `npx tsc --noEmit` (or `npm run build`) before pushing.

## Testing
- Vitest config: `vitest.config.mts` — uses `@vitejs/plugin-react` and `vite-tsconfig-paths`
- Run single test file: `npx vitest src/lib/__tests__/file-system.test.ts`
- Tests in `src/lib/__tests__/`, `src/lib/transform/__tests__/`, `src/lib/contexts/__tests__/`, `src/components/chat/__tests__/`
- E2E tests (`tests/e2e/`): `npm run test:e2e` — Playwright with Chromium; auto-starts dev server locally
- Known: `.opencode/node_modules/zod` tests fail (missing deps) — these are pre-existing and unrelated to project code
