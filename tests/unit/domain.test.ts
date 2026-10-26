import assert from "node:assert/strict";
import { test } from "vitest";
import { readShopSearch } from "@/features/catalog/model/catalog";
import {
  MAX_QUANTITY,
  clampQuantity,
  customProduct as createCustomProduct,
  restoreCart as decodeCart,
} from "@/features/cart/model/cart";
import {
  isGiftSelectionValid as validateGift,
  itemPrice as priceItem,
  shippingFee,
} from "@/features/cart/model/pricing";
import {
  restoreDraft as decodeDraft,
  restoreRecipes as decodeRecipes,
  validCounts as validateCounts,
} from "@/features/atelier/model/recipes";

import fixture from "../../mock-server/fixtures/catalog.json";
const catalog = fixture as import("@/features/catalog/model/catalog").Catalog;
const products = catalog.products;
const validCounts = (raw: unknown) => validateCounts(raw, catalog.ingredients);
const restoreRecipes = (raw: unknown) => decodeRecipes(raw, catalog.ingredients);
const restoreDraft = (raw: unknown) => decodeDraft(raw, catalog.ingredients);
const restoreCart = (raw: unknown) => decodeCart(raw, catalog);
const customProduct = (name: string, type = "eau-de-parfum") =>
  createCustomProduct(name, type, products);
const isGiftSelectionValid = (product: Parameters<typeof validateGift>[0], selection: string[]) =>
  validateGift(product, selection, products);
const itemPrice = (item: Parameters<typeof priceItem>[0]) => priceItem(item, products);

const product = products.find((p) => p.type === "eau-de-parfum")!;
const gift = products.find((p) => p.type === "gift-set")!;
const selection = products
  .filter((p) => p.collection === gift.collection && p.type !== "gift-set")
  .slice(0, 3)
  .map((p) => p.id);
const recipe = { id: "saved-1", name: "나의 향", counts: { bergamot: 3, rose: 2 } };

test("route search parameters normalize repeated values before initializing client state", () => {
  assert.deepEqual(
    readShopSearch({ collection: ["fresh", "soft"], type: "candle", q: ["rose", "wood"] }),
    {
      initialCollection: "fresh",
      initialType: "candle",
      initialQuery: "rose",
    },
  );
  assert.deepEqual(readShopSearch({ q: [] }), {
    initialCollection: undefined,
    initialType: undefined,
    initialQuery: undefined,
  });
});

test("ingredient counts accept known integer drops, strip zero entries and enforce the limit", () => {
  assert.deepEqual(validCounts({ bergamot: 20, rose: 0 }), { bergamot: 20 });
  for (const counts of [
    null,
    [],
    "rose",
    {},
    { rose: 0 },
    { rose: -1 },
    { rose: 1.5 },
    { rose: "1" },
    { rose: Infinity },
    { rose: NaN },
    { rose: 21 },
    { rose: 11, bergamot: 10 },
    { unknown: 1 },
  ]) {
    assert.equal(validCounts(counts), null);
  }
});

test("saved recipes discard corrupt rows and duplicate IDs, retaining usable compositions", () => {
  const restored = restoreRecipes([
    null,
    { ...recipe, counts: { missing: 1 } },
    recipe,
    recipe,
    { ...recipe, id: "" },
    { ...recipe, id: "bad-name", name: {} },
  ]);
  assert.equal(restored.length, 1);
  assert.deepEqual(restored[0], {
    ...recipe,
    parent: undefined,
    version: 1,
    label: "classic",
    color: "#d5b575",
    created: "",
  });
  assert.deepEqual(restoreRecipes({}), []);
});

test("draft restoration validates composition and normalizes display fields", () => {
  assert.equal(restoreDraft({ counts: { unknown: 2 }, step: "result" }), null);
  assert.equal(restoreDraft({ counts: "123" }), null);
  assert.deepEqual(restoreDraft({ counts: { rose: 2 }, name: {}, label: {}, step: "invalid" }), {
    counts: { rose: 2 },
    name: "",
    label: "classic",
    step: "select",
  });
  assert.equal(restoreDraft({ counts: { rose: 2 }, step: "result" })?.step, "result");
});

test("cart restoration rebuilds product data from the catalog and merges bounded quantities", () => {
  const rows = restoreCart([
    null,
    { product: { id: "missing" }, quantity: 2 },
    {
      product: { id: product.id, price: 1, name: {} },
      quantity: "12.9",
      selection: ["unexpected"],
    },
    { product, quantity: 10 },
  ]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].product, product);
  assert.equal(rows[0].quantity, MAX_QUANTITY);
  assert.deepEqual(rows[0].selection, []);
  for (const quantity of [NaN, Infinity, "invalid", -3, 0]) {
    assert.equal(clampQuantity(quantity), 1);
  }
  assert.equal(clampQuantity(2.9), 2);
});

test("gift sets require three distinct products in the same collection and merge regardless of order", () => {
  assert.equal(isGiftSelectionValid(gift, selection), true);
  const invalid = [
    [],
    selection.slice(0, 2),
    [selection[0], selection[0], selection[1]],
    [selection[0], selection[1], "unknown"],
    [selection[0], selection[1], products.find((p) => p.collection !== gift.collection)!.id],
  ];
  for (const chosen of invalid) {
    assert.equal(isGiftSelectionValid(gift, chosen), false);
    assert.deepEqual(restoreCart([{ product: gift, quantity: 1, selection: chosen }]), []);
    assert.equal(itemPrice({ product: gift, selection: chosen }), null);
  }
  const restored = restoreCart([
    { product: gift, quantity: 2, selection },
    { product: gift, quantity: 3, selection: [...selection].reverse() },
  ]);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].quantity, 5);
  assert.equal(
    itemPrice(restored[0]),
    selection.reduce((sum, id) => sum + products.find((p) => p.id === id)!.price!, 0),
  );
});

test("custom cart rows validate recipes and preserve unsupported legacy types for the existing warning", () => {
  const custom = { name: "나의 향", counts: { rose: 2 }, label: "paper", color: "#aabbcc" };
  const row = { product: customProduct(custom.name), quantity: 1, custom };
  assert.deepEqual(restoreCart([{ ...row, custom: { ...custom, counts: { rose: 21 } } }]), []);
  const restored = restoreCart([
    row,
    { ...row, custom: { ...custom, counts: { rose: 2, bergamot: 0 } } },
  ]);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].quantity, 2);
  const [legacy] = restoreCart([{ ...row, custom: { ...custom, productType: "candle" } }]);
  assert.equal(itemPrice(legacy), null);
});

test("shipping uses the free-shipping threshold and coupon eligibility", () => {
  assert.equal(shippingFee(49999, false), 3000);
  assert.equal(shippingFee(50000, false), 0);
  assert.equal(shippingFee(1000, true), 0);
});
