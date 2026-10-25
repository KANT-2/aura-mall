import { test, expect } from "./fixtures/test";
import { layoutCases } from "./fixtures/data";
import { seedLayout } from "./fixtures/api";

for (const screen of layoutCases) {
  test(`${screen.name} preserves its layout and appearance`, async ({ page, storefront }) => {
    await seedLayout(page, screen.name);
    await page.goto(screen.path);
    await storefront.prepareLayout(screen.name);
    await expect(page).toHaveScreenshot(`css-${screen.name}.png`, {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });
}
