# Why the preview URL "works" but the production URL "doesn't"

## The two URLs
- **URL1 (preview):** `https://open-code-in-action-vnavszmv7-blue-spice-machine-s-projects.vercel.app/`
- **URL2 (production):** `https://open-code-in-action.vercel.app/`

Both are the `open-code-in-action` app. They are **different Vercel deployments** with different setups — not the same code/config.

## Findings
| Check | Production (URL2) | Preview (URL1) |
|---|---|---|
| HTTP status | 200, loads fine | 302 → `vercel.com/login` (SSO deployment protection) |
| Latest build? | Yes (bundle contains current markers: `FreeUsageLimit`, `generationInterrupted`, "Generation was interrupted") | Runs from branch `blue-spice-machine` (no such branch in this repo → separate fork/project) |
| `/api/health` | `{"status":"ok","db":"ok"}` | n/a (behind SSO) |
| Browser runtime | Loads clean, 0 console errors | Only renders after Vercel SSO auth |
| Chat generation | Works when provider isn't throttled (generated a full counter component) | Untested (SSO) |
| Test connection | Fails: "Provider error: Rate limit exceeded" | — |

## Root cause: it's the AI provider (opencode zen), not Vercel or the code
Production's `POST /api/chat` returns:

```
3:"Failed after 3 attempts. Last error: Error from provider (Console): Rate limit exceeded. Please try again later."
```

- "Failed after 3 attempts" = the AI SDK retried the LLM call 3 times.
- "Rate limit exceeded" = the message returned by `https://opencode.ai/zen/v1` (`OPENAI_COMPATIBLE_BASE_URL`, model `big-pickle`).
- The app's provider resolution: `createOpenAICompatible({ name: "opencode-compatible", baseURL: https://opencode.ai/zen/v1, ... })` in `src/lib/provider.ts:533`.

### Proof it's opencode zen, not Vercel
1. The same `Rate limit exceeded` reproduces **locally** with no Vercel involved, against the same opencode zen endpoint.
2. Earlier, opencode zen returned `FreeUsageLimitError: Rate limit exceeded` (HTTP 429) directly.
3. If it were Vercel you'd see different failures:
   - Hobby's 60s cap → truncated/network-failed stream, not a clean stream error part.
   - The app's own 30 req/min/IP limiter → HTTP 429 `{"error": ...}` JSON, not a `3:"..."` stream error part.
   Neither is happening.

## Why the preview seems to work
- The preview URL is **SSO-protected**: it 302s to `vercel.com/login` and only loads once you're authenticated to Vercel (anyone else gets a login wall).
- It's a separate deployment (team `s-projects`, branch `blue-spice-machine`) with its **own env vars**, so its provider config likely isn't throttled — or it was tried at a moment when the opencode zen quota wasn't exhausted.

## Bottom line
- The app code and Vercel hosting are healthy.
- The throttle is the **opencode zen free usage limit** on the production account/key.
- Fix: raise/refill the opencode zen quota or point production at a provider with available quota — no code change required.
