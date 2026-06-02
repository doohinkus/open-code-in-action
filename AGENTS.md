# UIGen

## Setup & Commands
- `npm run setup` — install, prisma generate, prisma migrate dev (required first step)
- `npm run dev` — `next dev --turbopack`, opens at http://localhost:3000
- `npm test` — vitest (jsdom environment)
- `npm run build` / `npm start` — production
- `npm run lint` — `next lint`
- `npm run db:reset` — `prisma migrate reset --force`
- **Never run `npm audit fix`** — dependencies are pinned; audit fix breaks compatibility

## Prisma
- Schema: `prisma/schema.prisma` (SQLite)
- Generated client: `src/generated/prisma/` (import from `@/generated/prisma`)
- After schema changes: `npx prisma migrate dev --name <name>`

## AI / Chat
- No API key needed: `MockLanguageModel` in `src/lib/provider.ts` returns canned components (4-step limit, counter/form/card)
- Real Claude: set `ANTHROPIC_API_KEY` in `.env` (model: `claude-haiku-4-5`, 40-step max)
- OpenAI-compatible provider (Ollama, OpenCode Zen/Go, LM Studio): set `OPENAI_COMPATIBLE_BASE_URL`, `OPENAI_COMPATIBLE_MODEL` in `.env` (40-step max)
- Chat API route: `src/app/api/chat/route.ts` — uses `ai` SDK `streamText` with tools
- AI tools: `str_replace_editor` (view/create/replace/insert) and `file_manager` (rename/delete) — operate on VirtualFileSystem
- System prompt: `src/lib/prompts/generation.tsx` — requires `/App.jsx` entrypoint, `@/` import alias, Tailwind CSS

## Key Architecture
- **Virtual file system** (`src/lib/file-system.ts`): in-memory, never writes to real FS. Serialized to/from project data. Commands mirror Claude Code's str_replace_editor pattern.
- **Preview**: `src/lib/transform/jsx-transformer.ts` — Babel standalone transpiles → blob URLs → import map (esm.sh CDN) → iframe srcdoc with Tailwind CSS CDN
- **Auth**: JWT cookies (`jose`), 7-day expiry, `src/lib/auth.ts`. Cookie name: `auth-token`. Middleware protects `/api/projects` and `/api/filesystem`
- **Component structure (left→right)**: Chat panel (35%) | Preview/Code tabs (65%). Code view splits further into FileTree (30%) + Monaco editor (70%)
- **Path aliases**: `@/` → `./src/*`, `@/components/ui` for shadcn, `@/lib/utils` for `cn()` helper

## Important Constraints
- **Node 25+ SSR fix**: `node-compat.cjs` loaded in `next.config.ts` deletes `localStorage`/`sessionStorage` globals on server — do not remove
- **Anonymous users**: Work stored in `sessionStorage` via `src/lib/anon-work-tracker.ts`. Cleared on sign-up
- **`server-only`**: `src/lib/auth.ts` imports `server-only` — never import it in client components
- **shadcn/ui**: New York style, `components.json` at root. Existing UI components in `src/components/ui/`
- **CSS**: Tailwind v4 with `@import "tailwindcss"` syntax (not v3 config file). Uses `@tailwindcss/typography` plugin and `tw-animate-css`

## Testing
- Vitest config: `vitest.config.mts` — uses `@vitejs/plugin-react` and `vite-tsconfig-paths`
- Run single test file: `npx vitest src/lib/__tests__/file-system.test.ts`
- Tests in `src/lib/__tests__/`, `src/lib/transform/__tests__/`, `src/lib/contexts/__tests__/`, `src/components/chat/__tests__/`
