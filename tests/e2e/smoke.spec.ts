import { test, expect } from "@playwright/test";

test("homepage loads and shows the UI", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("h1, h2").first()).toBeVisible();
  expect(await page.title()).toBeTruthy();
});

test("chat panel is present", async ({ page }) => {
  await page.goto("/");

  const chatInput = page.locator("textarea, input[type='text']").first();
  await expect(chatInput).toBeVisible();
});

test("preview panel loads", async ({ page }) => {
  await page.goto("/");

  const preview = page.locator("iframe, [class*='preview']").first();
  await expect(preview).toBeVisible({ timeout: 10000 });
});
