import { describe, expect, it } from "vitest";
import fixture from "../../mock-server/fixtures/catalog.json";
import type { Catalog } from "@/features/catalog/model/catalog";
import { addCartItem, applyCartCommand, CartError } from "@/features/cart/model/cart-commands";
import { restoreStoredCart } from "@/features/cart/storage/cart-storage";

const catalog = fixture as Catalog;
const selection = ["fresh-hand-cream", "fresh-candle", "fresh-hand-wash"];
const custom = { name: "내 향", counts: { rose: 2 }, label: "paper", color: "#000000" };

describe("local cart commands", () => {
  it("merges matching items and leaves existing rows intact when the limit is exceeded", () => {
    const first = addCartItem([], { productId: "fresh-hand-cream", quantity: 14 }, catalog);
    const full = addCartItem(first, { productId: "fresh-hand-cream", quantity: 1 }, catalog);
    expect(full).toHaveLength(1);
    expect(full[0].quantity).toBe(15);
    expect(() =>
      addCartItem(full, { productId: "fresh-hand-cream", quantity: 1 }, catalog),
    ).toThrow(CartError);
    expect(first[0].quantity).toBe(14);
    expect(full[0].quantity).toBe(15);
    expect(
      applyCartCommand(full, { type: "quantity", key: full[0].key, quantity: 0 }, catalog),
    ).toEqual([]);
  });
  it("counts Gift Set contents together with single products on add and quantity changes", () => {
    const gift = addCartItem([], { productId: "fresh-gift-set", quantity: 10, selection }, catalog);
    expect(() =>
      addCartItem(gift, { productId: "fresh-hand-cream", quantity: 6 }, catalog),
    ).toThrow(CartError);
    const items = addCartItem(gift, { productId: "fresh-hand-cream", quantity: 5 }, catalog);
    expect(() =>
      applyCartCommand(items, { type: "quantity", key: gift[0].key, quantity: 11 }, catalog),
    ).toThrow(CartError);
    expect(
      applyCartCommand(items, { type: "quantity", key: gift[0].key, quantity: 9 }, catalog)[0]
        .quantity,
    ).toBe(9);
  });
  it.each([
    null,
    {},
    { productId: "missing", quantity: 1 },
    { productId: "fresh-hand-cream", custom, quantity: 1 },
    { custom: null, quantity: 1 },
    { custom: { ...custom, productType: "candle" }, quantity: 1 },
    { custom: { ...custom, counts: { rose: 21 } }, quantity: 1 },
    { custom: { ...custom, counts: { rose: 1.5 } }, quantity: 1 },
    { productId: "fresh-hand-cream", quantity: -1 },
    { productId: "fresh-hand-cream", quantity: "2" },
    {
      productId: "fresh-gift-set",
      quantity: 1,
      selection: ["fresh-candle", "fresh-candle", "soft-candle"],
    },
  ])("rejects invalid new item input %#", (input) => {
    expect(() => addCartItem([], input, catalog)).toThrow(CartError);
  });
  it("builds custom identities and colors from composition and rejects fractional quantity changes", () => {
    const items = addCartItem([], { custom, quantity: 1 }, catalog);
    expect(items[0].custom?.color).toBe(
      catalog.ingredients.find((item) => item.id === "rose")!.color,
    );
    expect(items[0].product.price).toBe(98000);
    expect(() =>
      applyCartCommand(items, { type: "quantity", key: items[0].key, quantity: 1.5 }, catalog),
    ).toThrow(CartError);
  });
  it("restores safe catalog data and ignores corrupt JSON and forged local prices", () => {
    expect(restoreStoredCart("{invalid", catalog)).toEqual([]);
    expect(restoreStoredCart('"invalid"', catalog)).toEqual([]);
    const [item] = restoreStoredCart(
      JSON.stringify([
        { product: { id: "missing" }, quantity: 2 },
        { product: { id: "fresh-hand-cream", price: 1 }, unitPrice: 1, quantity: 2 },
      ]),
      catalog,
    );
    expect(item.product.price).toBe(28000);
    expect(item.unitPrice).toBeUndefined();
    expect(item.quantity).toBe(2);
  });
});
