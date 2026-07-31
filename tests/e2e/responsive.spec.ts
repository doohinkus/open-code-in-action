import { test, expect } from "@playwright/test";

test.describe("mobile layout", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("shows Chat/Preview/Code tabs and switches views", async ({ page }) => {
    await page.goto("/");

    const chatTab = page.locator('[role="tab"]', { hasText: "Chat" });
    const previewTab = page.locator('[role="tab"]', { hasText: "Preview" });
    const codeTab = page.locator('[role="tab"]', { hasText: "Code" });

    await expect(chatTab).toBeVisible();
    await expect(previewTab).toBeVisible();
    await expect(codeTab).toBeVisible();

    // Chat is the default tab
    const chatInput = page.locator("textarea, input[type='text']").first();
    await expect(chatInput).toBeVisible();
    await expect(chatTab).toHaveAttribute("data-state", "active");

    // Switch to Preview
    await previewTab.click();
    await expect(page.getByText("Welcome to UI Generator")).toBeVisible();
    await expect(previewTab).toHaveAttribute("data-state", "active");

    // Switch to Code
    await codeTab.click();
    await expect(page.getByText("No files yet")).toBeVisible();
    await expect(page.getByText("Select a file to edit")).toBeVisible();
  });

  test("auto-switches to Preview when generation starts", async ({ page }) => {
    await page.goto("/");

    const chatInput = page.locator("textarea, input[type='text']").first();
    await expect(chatInput).toBeVisible();

    const previewTab = page.locator('[role="tab"]', { hasText: "Preview" });

    await chatInput.fill("Create a counter component");
    await chatInput.press("Enter");

    // Auto-switches to the Preview tab as generation begins
    await expect(previewTab).toHaveAttribute("data-state", "active", {
      timeout: 10000,
    });

    // The generated component eventually renders inside the preview iframe
    const previewIframe = page.frameLocator("iframe[title='Preview']");
    await expect(
      previewIframe.getByRole("button", { name: "Increase" })
    ).toBeVisible({ timeout: 30000 });
  });
});

test("desktop layout keeps the side-by-side split", async ({ page }) => {
  await page.goto("/");

  // No Chat tab — desktop shows the chat panel plus Preview/Code tabs
  await expect(page.locator('[role="tab"]', { hasText: "Chat" })).toHaveCount(0);
  await expect(page.locator('[role="tab"]')).toHaveCount(2);

  // Chat input is present in the left panel
  await expect(page.locator("textarea, input[type='text']").first()).toBeVisible();
});
