---
name: verify-app
description: Pre-commit verification for the running app. Use before committing significant changes, before pushing, or when asked to verify the app works, check a change in the browser, or smoke-test the dev server.
---

Before committing significant changes, verify the app end-to-end with the running dev server and Playwright MCP:

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
