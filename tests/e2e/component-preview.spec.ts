import { test, expect } from "@playwright/test";

test("preview loads without duplicate import error for multi-file components", async ({ page }) => {
  // Navigate to the app
  await page.goto("/");

  // Wait for the chat input to be ready
  const chatInput = page.locator("textarea, input[type='text']").first();
  await expect(chatInput).toBeVisible({ timeout: 10000 });

  // Request a component that triggers multi-file generation (card uses 2 files: App.jsx + Card.jsx)
  // The mock provider creates both files, each using JSX + React imports, which previously
  // caused "Cannot declare an imported binding name twice" errors in the preview
  await chatInput.fill("create a card component");
  await chatInput.press("Enter");

  // Wait for the assistant to finish its response (final summary appears)
  // The mock provider takes 4 steps; after step 4 it shows a summary text
  const summaryText = page.locator("text=The component is now ready to use");
  await expect(summaryText).toBeVisible({ timeout: 30000 });

  // Wait a moment for the preview iframe to fully render
  await page.waitForTimeout(2000);

  // The preview iframe should exist and be rendered
  const previewIframe = page.frameLocator("iframe[title='Preview']");
  await expect(previewIframe.locator("body")).toBeAttached({ timeout: 5000 });

  // Check that the "Failed to load app" error is NOT present inside the iframe
  // This error was caused by duplicate CDN import bindings when concatenating files
  const failedToLoad = previewIframe.locator("text=Failed to load app");
  await expect(failedToLoad).toHaveCount(0);

  // Verify the preview actually rendered content (the card component or app)
  // Look for any rendered React content in the #root div
  const rootContent = previewIframe.locator("#root");
  await expect(rootContent).toBeAttached();

  // The root div should contain rendered content (not just the error message)
  // Check that the error boundary is not showing
  const errorBoundary = previewIframe.locator(".error-boundary");
  await expect(errorBoundary).toHaveCount(0, { timeout: 5000 });
});
