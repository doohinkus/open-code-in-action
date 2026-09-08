---
name: ai-chat
description: AI/chat architecture reference — providers, model allowlists, fallback rotation, step/token limits, message compaction, VFS caching, and stream error handling. Use when working on src/app/api/chat/route.ts, src/lib/provider.ts, src/lib/models.ts, src/lib/message-compaction.ts, the chat UI, or anything model/provider related.
---

- **No API key needed**: `MockLanguageModel` in `src/lib/provider.ts` returns canned components (counter/form/card).
- **Provider**: Google AI Studio Gemini free tier (`GOOGLE_GENERATIVE_AI_API_KEY`; models in `GEMINI_FREE_MODELS` in `src/lib/models.ts`: `gemini-2.5-flash` (default), `gemini-2.5-flash-lite`; env override `GEMINI_MODEL`, thinking disabled via `GEMINI_THINKING_BUDGET`, default 0) → Mock fallback. Gemini is the only real provider; Anthropic and OpenAI-compatible/Zen endpoints are not supported (the `@ai-sdk/openai-compatible` dep and `reasoning-normalizer.ts` are kept unused for a possible re-add).
- **Fallback rotation**: Rate-limited/5xx/retired-model turns rotate through the remaining free Gemini models before auto-falling back to the mock via `createRateLimitFallbackModel` (`buildLanguageModel` in `src/lib/provider.ts`).
- **Chat API route**: `src/app/api/chat/route.ts` — uses `ai` SDK `streamText` with tools; rate-limited to 30 requests/min/IP (`RATE_LIMIT_*` in `src/lib/constants.ts`); `maxDuration = 120` for Vercel serverless.
- **Step/token limits** (`src/lib/constants.ts`): mock provider uses `maxSteps=4` (`MAX_STEPS_MOCK`); real providers use `maxSteps=10` (`MAX_STEPS_REAL`); test-connection requests use `maxSteps=1`, `maxTokens=64` (`MAX_TOKENS_TEST`).
- **Provider tuning**: Google provider sends `providerOptions.google = { thinkingConfig: { thinkingBudget: 0 } }` (override via `GEMINI_THINKING_BUDGET`).
- **Payload reduction** (to cut provider token usage): full history kept for persistence as `originalMessages`; the model gets a compacted copy via `prepareModelMessages` (`src/lib/message-compaction.ts`) — history capped at 12 messages (`COMPACT_HISTORY_MAX_MESSAGES`), non-last assistant messages collapsed to ≤300-char text placeholders (`COMPACTED_MESSAGE_MAX_LEN`), `reasoning` parts stripped.
- **VFS caching**: server keeps an in-memory VFS cache (`vfsCache` in `route.ts`; `VFS_CACHE_TTL_MS` 10-min TTL, `VFS_CACHE_MAX_ENTRIES` 100) keyed by `project:${projectId}` or `anon:${sessionKey}`; clients omit `files` unless the revision is dirty and transparently retry on HTTP `428 VFS_RESYNC_REQUIRED` (`chat-context.tsx`).
- **Stream errors** are surfaced to the client via `getErrorMessage` (`describeError` in `route.ts`); the AI SDK's default masks them as "An error occurred." — `mapErrorMessage` in `ChatInterface.tsx` shows the real message unless it's exactly that mask.
- **AI tools**: `str_replace_editor` (view/create/replace/insert) and `file_manager` (rename/delete) — operate on VirtualFileSystem.
- **System prompt**: `src/lib/prompts/generation.tsx` — requires `/App.jsx` entrypoint, `@/` import alias, Tailwind CSS.
