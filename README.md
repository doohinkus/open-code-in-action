# UIGen

AI-powered React component generator with live preview.

## Prod Release (Free Tier)

### https://open-code-in-action.vercel.app

## Prerequisites

- Node.js 25+
- npm
- A Neon Postgres database (free at [neon.tech](https://neon.tech))

## Setup

1. Install dependencies and initialize the database (requires `DATABASE_URL` pointing to a Neon Postgres instance):

   ```bash
   npm run setup
   ```

2. (Optional) Copy `.example.env` to `.env` to configure your preferred AI provider and database. The project runs without any API key — it falls back to a mock provider that returns canned components.

   ```bash
   cp .example.env .env
   ```

> **Don't run `npm audit fix`.** Dependencies are pinned to specific versions that work together. The vulnerability warnings are cosmetic for a local-only project, and `audit fix` can bump packages past compatible versions and break the app.

## Running the Application

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

Other scripts:

| Script                    | What it does                                       |
| ------------------------- | -------------------------------------------------- |
| `npm run dev:daemon`      | Same as `dev` but backgrounds and writes `logs.txt` |
| `npm run build` / `start` | Production build / serve                           |
| `npm run vercel-build`    | `prisma generate && next build` (what Vercel runs) |
| `npm run db:reset`        | `prisma migrate reset --force`                     |

## Testing

| Command               | What it runs                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| `npm test`            | Vitest unit tests (jsdom)                                                                        |
| `npm run test:e2e`    | Playwright e2e + a11y tests (auto-starts the dev server locally)                                  |
| `npm run test:e2e:ui` | Playwright UI mode                                                                               |
| `npm run lint`        | ESLint                                                                                          |

### E2E tests (`tests/e2e/`)

| File                           | Tests                                                             |
| ------------------------------ | ----------------------------------------------------------------- |
| `smoke.spec.ts`                | Homepage loads, chat panel present, preview panel loads (3 tests) |
| `a11y.spec.ts`                 | axe-core accessibility audit of homepage                          |
| `component-generation.spec.ts` | Send chat message, tab navigation (2 tests)                       |
| `component-preview.spec.ts`    | Multi-file components render in preview without import errors (1 test) |
| `responsive.spec.ts`           | Mobile layout: Chat/Preview/Code tabs and view switching (3 tests) |

Run locally: `npm run test:e2e` — Playwright's `webServer` config automatically starts the dev server (`npm run dev`) if none is already running (an existing server is reused), and pins `FORCE_MOCK_PROVIDER=1` for deterministic runs. Only CI-style runs (with `CI=true`, where the `webServer` is undefined) require a separately running server.

## Database

PostgreSQL via [Neon](https://neon.tech). Uses `@prisma/adapter-neon` with `PrismaNeonHttp` for serverless connections. Requires two environment variables pointing to the Neon Postgres database: `DATABASE_URL` (pooled, used at runtime) and `DATABASE_URL_UNPOOLED` (set as `directUrl` in `prisma/schema.prisma`, used for migrations).

> Version note: `@prisma/adapter-neon` is currently `^7.8.0` alongside `prisma`/`@prisma/client` `^6.10.1`. This pairing works as pinned — don't `npm audit fix` one without the other.

### Schema

```prisma
model User {
  id        String    @id
  email     String    @unique
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  projects  Project[]
}

model Project {
  id        String   @id @default(cuid())
  name      String
  userId    String?
  messages  String   @default("[]")
  data      String   @default("{}")
  version   Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user      User?    @relation(fields: [userId], references: [id], onDelete: Cascade)
  shares    Share[]
}

model Share {
  id        String   @id @default(cuid())
  token     String   @unique
  name      String   @default("Shared component")
  data      String   @default("{}")
  projectId String?
  project   Project? @relation(fields: [projectId], references: [id], onDelete: SetNull)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([projectId])
}
```

Migrations are in `prisma/migrations/`. After schema changes:

```bash
npx prisma migrate dev --name <description>
```

Note: each `Share` has no `userId` column — share ownership is enforced server-side via the linked `Project` (`Project.userId` lookups in `src/lib/share.ts`), so adding a `Share.userId` by hand would be redundant.

### Neon Auth

Authentication is handled by [Neon Auth](https://neon.tech/docs/guides/neon-auth) (`@neondatabase/auth`). Sign-in is Google-only — the header "Sign In" button redirects straight to Google OAuth; there is no email/password or sign-up flow. Anonymous users can use the app without an account; their work is migrated into a project when they sign in. Required env vars: `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`. Email/password auth must be disabled in the Neon Auth gateway so it can't be reached via the `/api/auth/*` proxy.

## Sharing

Every project gets a stable public share link (the **Open** button in the ShareBar): `POST /api/share` upserts the project's files under a generated token keyed by `projectId`, so the URL stays the same across edits. The link opens `/s/<token>` — a public, standalone viewer that renders the component with an OG/Twitter card and offers ZIP and Storybook downloads. Rate-limited to 30 requests/min/IP; anonymous (signed-out) users can share, and only a project's owner can update or re-attach its share.

## CI/CD Pipeline

Three GitHub Actions workflows in `.github/workflows/`:

### `ci.yml` — Pull Request Checks

```
PR opened
  └── lint-test-build: lint + unit tests + build (Node 25)
```

> The `e2e-a11y` job (Playwright e2e + axe-core accessibility) is scaffolded in the workflow but currently **commented out** — it regressed on `main` (commit `7696b1f`) and is disabled until the CI infra is restored.

### `deploy.yml` — Push to Main

```
Push to main
  └── lint + unit tests
```

> A canary→production Vercel pipeline (`deploy-canary` → `test-canary` → `promote-to-prod`) is scaffolded in the workflow but currently disabled. Re-enable by uncommenting the jobs and configuring GitHub secrets (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`).

### Additional Workflows

- **`opencode.yml`** — Runs the OpenCode agent on `/oc` or `/opencode` comments in issues and PRs.

## Usage

1. Sign in with Google or continue as an anonymous user
2. Describe the React component you want to create in the chat
3. View generated components in real-time preview
4. Switch to Code view to see and edit the generated files
5. Continue iterating with the AI to refine your components
6. Share your work: the preview panel's **Open** link opens a public page (`/s/<token>`) that always renders the latest generated version
7. Download your work: raw source files as a ZIP, or as a runnable Storybook 9 project (React + Vite + Tailwind).

## Features

- AI-powered component generation (Google Gemini or Groq, with automatic cross-provider fallback; runs with a mock provider when no API key is set)
- Live preview with hot reload
- Stable public share links with a self-updating standalone preview page
- Virtual file system (no files written to disk)
- Syntax highlighting and code editor
- Component persistence for registered users
- Download as a runnable Storybook project with generated stories (`src/lib/export-storybook.ts`)

## Tech Stack

- Next.js 15 with App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Prisma with Neon Postgres
- Vercel AI SDK
- Google Gemini or Groq (AI SDK)
- Playwright + axe-core (e2e + a11y tests)
- GitHub Actions (CI/CD)
