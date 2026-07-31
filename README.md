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

## Testing

| Command               | What it runs                                              |
| --------------------- | --------------------------------------------------------- |
| `npm test`            | Vitest unit tests (jsdom)                                 |
| `npm run test:e2e`    | Playwright e2e + a11y tests (requires dev server running) |
| `npm run test:e2e:ui` | Playwright UI mode                                        |
| `npm run lint`        | ESLint                                                    |

### E2E tests (`tests/e2e/`)

| File                           | Tests                                                             |
| ------------------------------ | ----------------------------------------------------------------- |
| `smoke.spec.ts`                | Homepage loads, chat panel present, preview panel loads (3 tests) |
| `a11y.spec.ts`                 | axe-core accessibility audit of homepage                          |
| `component-generation.spec.ts` | Send chat message, tab navigation (2 tests)                       |

Run locally: start `npm run dev` in one terminal, then `npm run test:e2e` in another.

## Database

PostgreSQL via [Neon](https://neon.tech). Uses `@prisma/adapter-neon` with `PrismaNeonHttp` for serverless connections. Requires a `DATABASE_URL` environment variable pointing to a Neon Postgres database.

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
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  user      User?    @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

Migrations are in `prisma/migrations/`. After schema changes:

```bash
npx prisma migrate dev --name <description>
```

### Neon Auth

Authentication is handled by [Neon Auth](https://neon.tech/docs/guides/neon-auth) (`@neondatabase/auth`). Sign-in is Google-only — the header "Sign In" button redirects straight to Google OAuth; there is no email/password or sign-up flow. Anonymous users can use the app without an account; their work is migrated into a project when they sign in. Required env vars: `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`. Email/password auth must be disabled in the Neon Auth gateway so it can't be reached via the `/api/auth/*` proxy.

## CI/CD Pipeline

Two GitHub Actions workflows in `.github/workflows/`:

### `ci.yml` — Pull Request Checks

```
PR opened
  ├── lint + unit tests + build
  └── e2e + a11y
      └── all pass → PR can merge
```

Runs on every PR to `main`. All tests run on the build artifact — no deploy needed.

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

## Features

- AI-powered component generation (OpenCode Zen, Google Gemini, Anthropic Claude, or mock)
- Live preview with hot reload
- Virtual file system (no files written to disk)
- Syntax highlighting and code editor
- Component persistence for registered users

## Tech Stack

- Next.js 15 with App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Prisma with Neon Postgres
- Vercel AI SDK
- OpenCode Zen / Google Gemini / Anthropic Claude
- Playwright + axe-core (e2e + a11y tests)
- GitHub Actions (CI/CD)
