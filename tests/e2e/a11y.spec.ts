import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("homepage should not have any automatically detectable a11y issues", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const results = await new AxeBuilder({ page }).analyze();

  expect(results.violations).toEqual([]);
});
