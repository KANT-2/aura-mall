import type { Page } from "@playwright/test";
import type { Catalog } from "@/features/catalog/model/catalog";
import { testIds } from "@/lib/test-ids";
import { test, expect } from "./fixtures/test";

async function overrideStock(page: Page, stocks: Record<string, number>) {
  await page.route("**/api/catalog", async (route) => {
    const response = await route.fetch();
    const catalog: Catalog = await response.json();
    for (const product of catalog.products) {
      product.stock = stocks[product.id] ?? product.stock;
    }

    await route.fulfill({ response, json: catalog });
  });
}

async function returnToStorefront(page: Page) {
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true })),
  );
}

test("sold-out products have one badge and refresh purchase controls when stock changes", async ({
  page,
  storefront,
}) => {
  const stocks = { "fresh-hand-cream": 0 };
  await overrideStock(page, stocks);
  await storefront.openCatalogFromMenu();
  await returnToStorefront(page);
  const product = storefront.products.and(page.locator('[href="/shop/fresh-hand-cream"]'));
  await expect(product.getByLabel("품절", { exact: true })).toHaveCount(1);
  await expect(product.getByText("품절", { exact: true })).toHaveCount(0);
  await expect(product.getByText("SOLD OUT", { exact: true })).toHaveCSS("display", "grid");
  await product.click();
  await expect(storefront.addToCart).toBeDisabled();
  await expect(storefront.addToCart).toHaveText("품절");
  await expect(page.getByRole("button", { name: "수량 늘리기" })).toHaveCount(0);

  stocks["fresh-hand-cream"] = 2;
  await returnToStorefront(page);
  await expect(storefront.addToCart).toBeEnabled();
  await page.getByRole("button", { name: "수량 늘리기" }).click();
  await expect(page.getByRole("button", { name: "수량 늘리기" })).toBeDisabled();

  stocks["fresh-hand-cream"] = 1;
  await returnToStorefront(page);
  await expect(storefront.addToCart).toBeDisabled();
  await page.getByRole("button", { name: "수량 줄이기" }).click();
  await expect(storefront.addToCart).toBeEnabled();
  await storefront.addToCart.click();
  await expect(page.getByRole("link", { name: "장바구니에서 확인하기" })).toBeVisible();
});

test("gift quantities respect every selected component and reject a newly sold-out component", async ({
  page,
  storefront,
}) => {
  const stocks = { "fresh-hand-cream": 2, "fresh-body-lotion": 0 };
  await overrideStock(page, stocks);
  await page.goto("/shop/fresh-gift-set");
  await page.getByRole("button", { name: "수량 늘리기" }).click();
  await page.getByRole("button", { name: "수량 줄이기" }).click();
  await returnToStorefront(page);
  const options = page.getByTestId(testIds.catalog.giftOption);
  await expect(options.nth(2)).toBeDisabled();
  for (const index of [0, 1, 8]) {
    await options.nth(index).check();
  }

  await expect(storefront.addToCart).toBeEnabled();
  await page.getByRole("button", { name: "수량 늘리기" }).click();
  await expect(page.getByRole("button", { name: "수량 늘리기" })).toBeDisabled();
  await expect(storefront.addToCart).toBeEnabled();

  stocks["fresh-hand-cream"] = 0;
  await returnToStorefront(page);
  await expect(storefront.addToCart).toBeDisabled();
  await expect(options.nth(0)).toBeEnabled();
  await options.nth(0).uncheck();
  await expect(options.nth(0)).toBeDisabled();
});

test("a stocked product without a selling price stays unavailable for purchase", async ({
  page,
  storefront,
}, testInfo) => {
  // Each viewport uses a different SKU; restore it even if the UI assertion fails.
  const id = testInfo.project.name === "mobile" ? "soft-perfume-oil" : "warm-perfume-oil";
  expect(
    (
      await page.request.post("/api/admin/auth/login", {
        data: { email: "admin@aura.local", password: "aura-admin-local" },
      })
    ).status(),
  ).toBe(200);
  const path = `/api/admin/products/${id}`;
  const before = await (await page.request.get(path)).json();
  try {
    expect(
      (await page.request.patch(path, { data: { version: before.version, price: null } })).status(),
    ).toBe(200);
    await page.goto(`/shop/${id}`);
    await expect(storefront.addToCart).toContainText("가격 확인 중");
    await expect(storefront.addToCart).toBeDisabled();
    await expect(page.getByRole("button", { name: "수량 늘리기" })).toBeVisible();
  } finally {
    const current = await (await page.request.get(path)).json();
    expect(
      (
        await page.request.patch(path, {
          data: { version: current.version, price: before.price },
        })
      ).status(),
    ).toBe(200);
  }
});
