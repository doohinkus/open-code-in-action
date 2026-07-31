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

  // Fresh session with no files shows the preview empty state
  await expect(page.getByText("Welcome to UI Generator")).toBeVisible();
});
