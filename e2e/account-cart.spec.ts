import { test, expect } from "./fixtures/test";
import { seedApi } from "./fixtures/api";
import { randomUUID } from "node:crypto";
import { routes } from "./fixtures/data";

test("client authentication switches cart ownership and restores the guest cart", async ({
  page,
  account,
}) => {
  const credentials = {
    name: "Cart Owner",
    email: `${randomUUID()}@example.com`,
    password: "password123",
  };
  await seedApi(page, { cart: [{ product: { id: "fresh-hand-cream" }, quantity: 2 }] });
  expect((await page.request.post("/api/auth/register", { data: credentials })).status()).toBe(201);
  expect(
    (
      await page.request.post("/api/cart/items", {
        data: { productId: "soft-candle", quantity: 1 },
      })
    ).status(),
  ).toBe(201);
  await page.request.post("/api/auth/logout");
  await account.signIn(credentials, routes.cart);
  await expect(account.cartItems).toHaveCount(1);
  await expect(account.firstProductLink).toHaveAttribute("href", `${routes.shop}/soft-candle`);
  await account.signOut();
  await account.openCart();
  await expect(account.cartItems).toHaveCount(1);
  await expect(account.firstProductLink).toHaveAttribute("href", `${routes.shop}/fresh-hand-cream`);
  await page.reload();
  await expect(account.cartItems).toHaveCount(1);
});
