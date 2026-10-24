import { test, expect } from "@playwright/test";

// Baselines were captured before extracting the legacy overrides into a CSS Module.
test("atelier selection and blend layout retain the established appearance", async ({ page }) => {
  await page.goto("/atelier");
  await page.getByRole("button", { name: "향료 직접 고르기" }).click();
  await page.getByRole("button", { name: "베르가못 한 방울 추가", exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("atelier-select.png", { fullPage: true, maxDiffPixels: 100 });
  await page.locator(".a-blend-button:visible,.a-mobile-dock .button:visible").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("atelier-blend.png", { fullPage: true, maxDiffPixels: 100 });
  const modal = await page.getByRole("dialog").boundingBox();
  expect(modal).not.toBeNull();
  const viewport = page.viewportSize()!;
  expect(modal!.x).toBeGreaterThanOrEqual(0);
  expect(modal!.y).toBeGreaterThanOrEqual(0);
  expect(modal!.x + modal!.width).toBeLessThanOrEqual(viewport.width);
  expect(modal!.y + modal!.height).toBeLessThanOrEqual(viewport.height);
});
