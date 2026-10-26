import { test, expect } from "./fixtures/test";
import { seedLocalCart } from "./fixtures/api";
import { randomUUID } from "node:crypto";
import { routes } from "./fixtures/data";
import { testIds } from "@/lib/test-ids";
import { CART_STORAGE_KEY } from "@/features/cart/storage/cart-storage";

const single = [{ product: { id: "fresh-hand-cream" }, quantity: 2 }];

test("local cart survives authentication and reload without cart API calls", async ({
  page,
  account,
  storefront,
}) => {
  const cartRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/cart")) {
      cartRequests.push(request.url());
    }
  });
  const credentials = {
    name: "Cart Owner",
    email: `${randomUUID()}@example.com`,
    password: "password123",
  };
  expect((await page.request.post("/api/auth/register", { data: credentials })).status()).toBe(201);
  await page.request.post("/api/auth/logout");
  await page.goto("/shop/fresh-hand-cream");
  await storefront.addToCart.click();
  await expect(page.getByTestId(testIds.navigation.cart)).toHaveAttribute(
    "aria-label",
    "장바구니 1개",
  );
  await account.openCart();
  await expect(account.cartItems).toHaveCount(1);
  await expect(account.firstProductLink).toHaveAttribute("href", "/shop/fresh-hand-cream");
  await account.signIn(credentials, routes.cart);
  await expect(account.cartItems).toHaveCount(1);
  await expect(account.firstProductLink).toHaveAttribute("href", "/shop/fresh-hand-cream");
  await account.signOut();
  await account.openCart();
  await expect(account.cartItems).toHaveCount(1);
  await page.reload();
  await expect(account.cartItems).toHaveCount(1);
  const stored = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    CART_STORAGE_KEY,
  );
  expect(stored[0].product).toEqual({ id: "fresh-hand-cream" });
  expect(stored[0]).not.toHaveProperty("unitPrice");
  expect(cartRequests).toEqual([]);
});

test("quantity changes and deletion sync across tabs and survive reload", async ({
  page,
  context,
}) => {
  await seedLocalCart(page, single);
  await page.goto(routes.cart);
  const second = await context.newPage();
  try {
    await second.goto(routes.cart);
    const firstItem = page.getByTestId(testIds.cart.item);
    const secondItem = second.getByTestId(testIds.cart.item);
    await expect(secondItem.getByRole("status")).toHaveText("2");
    await firstItem.getByRole("button", { name: "수량 늘리기" }).click();
    await expect(firstItem.getByRole("status")).toHaveText("3");
    await expect(secondItem.getByRole("status")).toHaveText("3");
    await secondItem.getByRole("button", { name: "삭제", exact: true }).click();
    await expect(firstItem).toHaveCount(0);
    await page.reload();
    await expect(firstItem).toHaveCount(0);
    await expect(page.getByTestId(testIds.navigation.cart)).toHaveAttribute(
      "aria-label",
      "장바구니 0개",
    );
  } finally {
    await second.close();
  }
});

test("restored prices come from the catalog and a separate browser has an empty cart", async ({
  page,
  browser,
}) => {
  await seedLocalCart(page, [
    { product: { id: "fresh-hand-cream", price: 1 }, unitPrice: 1, quantity: 2 },
  ]);
  await page.goto(routes.cart);
  await expect(page.getByTestId(testIds.cart.item)).toContainText("56,000");
  await page.reload();
  await expect(page.getByTestId(testIds.cart.item)).toContainText("56,000");
  const isolated = await browser.newContext();
  try {
    const other = await isolated.newPage();
    await other.goto("http://127.0.0.1:3100/cart");
    await expect(other.getByRole("heading", { name: "아직 담은 향이 없어요." })).toBeVisible();
  } finally {
    await isolated.close();
  }
});

test("corrupt local data is recoverable and does not overwrite valid selections on mount", async ({
  page,
  storefront,
}) => {
  await seedLocalCart(page, single);
  await page.evaluate((key) => localStorage.setItem(key, "{invalid"), CART_STORAGE_KEY);
  await page.goto(routes.cart);
  await expect(page.getByRole("heading", { name: "아직 담은 향이 없어요." })).toBeVisible();
  await page.goto("/shop/fresh-hand-cream");
  await storefront.addToCart.click();
  await page.goto(routes.cart);
  await expect(page.getByTestId(testIds.cart.item)).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId(testIds.cart.item)).toHaveCount(1);
});

test("blocked storage reports failure without confirming an unsaved item", async ({
  page,
  storefront,
}) => {
  await page.addInitScript((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) {
        throw new DOMException("Storage blocked", "QuotaExceededError");
      }

      return original.call(this, name, value);
    };
  }, CART_STORAGE_KEY);
  await page.goto("/shop/fresh-hand-cream");
  await storefront.addToCart.click();
  await expect(
    page.getByRole("status").filter({ hasText: "장바구니를 저장하지 못했어요." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "장바구니에서 확인하기" })).toHaveCount(0);
  await expect(page.getByTestId(testIds.navigation.cart)).toHaveAttribute(
    "aria-label",
    "장바구니 0개",
  );
});
