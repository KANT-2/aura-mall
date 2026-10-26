import { test, expect } from "./fixtures/test";

test("atelier selection and blend layout retain the established appearance", async ({
  page,
  atelier,
}) => {
  await atelier.openWorkspace();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("atelier-select.png", { fullPage: true, maxDiffPixels: 100 });
  await atelier.openBlend();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("atelier-blend.png", { fullPage: true, maxDiffPixels: 100 });
  const modal = await atelier.dialog.boundingBox();
  expect(modal).not.toBeNull();
  const viewport = page.viewportSize()!;
  expect(modal!.x).toBeGreaterThanOrEqual(0);
  expect(modal!.y).toBeGreaterThanOrEqual(0);
  expect(modal!.x + modal!.width).toBeLessThanOrEqual(viewport.width);
  expect(modal!.y + modal!.height).toBeLessThanOrEqual(viewport.height);
});
