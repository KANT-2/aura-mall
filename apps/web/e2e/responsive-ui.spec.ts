import { test, expect } from "./fixtures/test";
import { layoutCases, routes } from "./fixtures/data";
import { testIds } from "@/lib/test-ids";

test("pages and navigation fit a 320px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  for (const { path } of [...layoutCases, { path: routes.atelier }]) {
    await page.goto(path);
    await expect(page.getByRole("main")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
    const header = page.locator(".header");
    const navigation = header.getByRole("navigation");
    const box = await navigation.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual((await header.boundingBox())!.height + 1);
  }

  await page.getByTestId(testIds.navigation.search).click();
  await expect(page.getByTestId(testIds.navigation.searchInput)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test("product photos never cover the product name on phone and tablet layouts", async ({
  page,
}) => {
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [routes.product, routes.gift]) {
      await page.goto(path);
      const photoRegion = page.locator(".detail-image");
      const heading = page.getByRole("heading", { level: 1 });
      await expect(photoRegion).toBeVisible();
      await expect(heading).toBeVisible();
      const photo = await photoRegion.boundingBox();
      const title = await heading.boundingBox();
      const overlapX =
        Math.min(photo!.x + photo!.width, title!.x + title!.width) - Math.max(photo!.x, title!.x);
      const overlapY =
        Math.min(photo!.y + photo!.height, title!.y + title!.height) - Math.max(photo!.y, title!.y);
      expect(overlapX <= 0 || overlapY <= 0).toBe(true);
      expect(photo!.y).toBeLessThanOrEqual(200);
    }
  }
});

test("narrow Gift Set selection stays clickable and its cart thumbnail contains all products", async ({
  page,
  storefront,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(routes.gift);
  await expect(storefront.addToCart).toBeDisabled();
  for (let index = 0; index < 3; index++) {
    await page.getByTestId(testIds.catalog.giftOption).nth(index).check();
  }

  await storefront.addToCart.click();
  await page.getByTestId(testIds.navigation.cart).click();
  const gift = page.getByRole("img", { name: /제품 3개 선택/ });
  await expect(gift).toBeVisible();
  await expect(gift.locator("img")).toHaveCount(3);
  const frame = await gift.boundingBox();
  for (const image of await gift.locator("img").all()) {
    const box = await image.boundingBox();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.y).toBeGreaterThanOrEqual(frame!.y);
    expect(box!.y + box!.height).toBeLessThanOrEqual(frame!.y + frame!.height + 1);
  }
});

test("mobile result actions keep full width and readable labels", async ({ page, atelier }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await atelier.openWorkspace();
  await atelier.openBlend();
  await atelier.finishByKeyboard();
  await atelier.name.fill("나만의 향");
  const buy = await atelier.addToCart.boundingBox();
  const save = await page.getByRole("link", { name: "로그인하고 향 저장하기" }).boundingBox();
  expect(buy!.width).toBeGreaterThan(270);
  expect(save!.width).toBeCloseTo(buy!.width, 0);
  expect(buy!.height).toBeLessThan(70);
  expect(save!.y).toBeGreaterThanOrEqual(buy!.y + buy!.height);
});

test("collection captions stay centered on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(routes.home);
  for (const title of ["맑은 순간의 향", "살결 가까이, 부드럽게", "깊고 따뜻한 잔향"]) {
    const heading = page.getByRole("heading", { name: title, exact: true });
    const card = heading.locator("..");
    const box = await card.boundingBox();
    const caption = await card.locator(":scope > .eyebrow").boundingBox();
    expect(Math.abs(caption!.x + caption!.width / 2 - (box!.x + box!.width / 2))).toBeLessThan(1);
  }
});

test("product image preview is centered and fits the viewport", async ({ page }) => {
  await page.goto(routes.product);
  await page.getByRole("button", { name: /제품 사진 크게 보기/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize()!;
  expect(Math.abs(box!.x + box!.width / 2 - viewport.width / 2)).toBeLessThan(2);
  expect(Math.abs(box!.y + box!.height / 2 - viewport.height / 2)).toBeLessThan(2);
  await dialog.getByRole("button", { name: "이미지 확대 닫기" }).click();
  await expect(dialog).not.toBeVisible();
});
