# UIGen

AI-powered React component generator with live preview.

## Prerequisites

- Node.js 25+
- npm

## Setup

1. Copy `.example.env` to `.env` and configure your preferred AI provider. The project runs without any API key — it falls back to a mock provider that returns canned components.

   ```bash
   cp .example.env .env
   ```

2. Install dependencies and initialize the database:

```bash
npm run setup
```

> **Don't run `npm audit fix`.** Dependencies are pinned to specific versions that work together. The vulnerability warnings are cosmetic for a local-only project, and `audit fix` can bump packages past compatible versions and break the app.

This command will:

- Install all dependencies
- Generate Prisma client
- Run database migrations

## Running the Application

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Usage

1. Sign up or continue as anonymous user
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
- Export generated code

## Tech Stack

- Next.js 15 with App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Prisma with SQLite
- Vercel AI SDK
- OpenCode Zen / Google Gemini / Anthropic Claude
