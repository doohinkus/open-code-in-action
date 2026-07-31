import { test, expect } from "@playwright/test";

test("user can send a message in chat", async ({ page }) => {
  await page.goto("/");

  const chatInput = page.locator("textarea, input[type='text']").first();
  await expect(chatInput).toBeVisible();

  await chatInput.fill("Create a counter component");
  await chatInput.press("Enter");

  // User message echoes back in the conversation
  await expect(page.getByText("Create a counter component")).toBeVisible();

  // Assistant eventually responds with a generated component
  await expect(page.locator('[data-role="assistant"]')).toBeVisible({
    timeout: 15000,
  });
});

test("navigation between preview and code tabs works", async ({ page }) => {
  await page.goto("/");

  const codeTab = page.locator("button, a").filter({ hasText: /code/i }).first();
  if (await codeTab.isVisible()) {
    await codeTab.click();
    await expect(page.locator("[class*='monaco'], [class*='editor'], [class*='code']").first()).toBeVisible({ timeout: 5000 });
  }
});
