import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import * as accounts from "../lib/aura/accounts";
import { MAX_QUANTITY, findProduct, products, readShopSearch } from "../lib/aura/catalog";
import { clampQuantity, customProduct, restoreCart } from "../lib/aura/cart";
import { isGiftSelectionValid, itemPrice, shippingFee } from "../lib/aura/pricing";
import { restoreDraft, restoreRecipes, validCounts } from "../lib/aura/recipes";

const product = products.find(p => p.type === "eau-de-parfum")!;
const gift = products.find(p => p.type === "gift-set")!;
const selection = products.filter(p => p.collection === gift.collection && p.type !== "gift-set").slice(0, 3).map(p => p.id);
const recipe = { id: "saved-1", name: "나의 향", counts: { bergamot: 3, rose: 2 } };

test("canonical products and legacy aliases use one resolver; unknown IDs remain missing", () => {
  assert.equal(findProduct(product.id), product);
  for (const [alias, id] of [
    ["bergamot-veil", "fresh-eau-de-parfum"],
    ["petal-haze", "soft-eau-de-parfum"],
    ["cedar-trace", "warm-eau-de-parfum"],
    ["soft-skin", "soft-eau-de-parfum"],
    ["fig-reverie", "soft-eau-de-parfum"],
    ["amber-dusk", "warm-eau-de-parfum"],
  ]) assert.equal(findProduct(alias)?.id, id);
  for (const id of ["unknown", "toString", "constructor", "__proto__"]) assert.equal(findProduct(id), undefined);
});

test("route search parameters normalize repeated values before initializing client state", () => {
  assert.deepEqual(readShopSearch({ collection: ["fresh", "soft"], type: "candle", q: ["rose", "wood"] }), {
    initialCollection: "fresh", initialType: "candle", initialQuery: "rose",
  });
  assert.deepEqual(readShopSearch({ q: [] }), { initialCollection: undefined, initialType: undefined, initialQuery: undefined });
});

test("ingredient counts accept known integer drops, strip zero entries and enforce the limit", () => {
  assert.deepEqual(validCounts({ bergamot: 20, rose: 0 }), { bergamot: 20 });
  for (const counts of [null, [], "rose", {}, { rose: 0 }, { rose: -1 }, { rose: 1.5 }, { rose: "1" }, { rose: Infinity }, { rose: NaN }, { rose: 21 }, { rose: 11, bergamot: 10 }, { unknown: 1 }]) {
    assert.equal(validCounts(counts), null);
  }
});

test("saved recipes discard corrupt rows and duplicate IDs, retaining usable compositions", () => {
  const restored = restoreRecipes([null, { ...recipe, counts: { missing: 1 } }, recipe, recipe, { ...recipe, id: "" }, { ...recipe, id: "bad-name", name: {} }]);
  assert.equal(restored.length, 1);
  assert.deepEqual(restored[0], { ...recipe, parent: undefined, version: 1, label: "classic", color: "#d5b575", created: "" });
  assert.deepEqual(restoreRecipes({}), []);
});

test("draft restoration validates composition and normalizes display fields", () => {
  assert.equal(restoreDraft({ counts: { unknown: 2 }, step: "result" }), null);
  assert.equal(restoreDraft({ counts: "123" }), null);
  assert.deepEqual(restoreDraft({ counts: { rose: 2 }, name: {}, label: {}, step: "invalid" }), {
    counts: { rose: 2 }, name: "", label: "classic", step: "select",
  });
  assert.equal(restoreDraft({ counts: { rose: 2 }, step: "result" })?.step, "result");
});

test("cart restoration rebuilds product data from the catalog and merges bounded quantities", () => {
  const rows = restoreCart([
    null,
    { product: { id: "missing" }, quantity: 2 },
    { product: { id: product.id, price: 1, name: {} }, quantity: "12.9", selection: ["unexpected"] },
    { product, quantity: 10 },
  ]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].product, product);
  assert.equal(rows[0].quantity, MAX_QUANTITY);
  assert.deepEqual(rows[0].selection, []);
  for (const quantity of [NaN, Infinity, "invalid", -3, 0]) assert.equal(clampQuantity(quantity), 1);
  assert.equal(clampQuantity(2.9), 2);
});

test("gift sets require three distinct products in the same collection and merge regardless of order", () => {
  assert.equal(isGiftSelectionValid(gift, selection), true);
  const invalid = [[], selection.slice(0, 2), [selection[0], selection[0], selection[1]], [selection[0], selection[1], "unknown"], [selection[0], selection[1], products.find(p => p.collection !== gift.collection)!.id]];
  for (const chosen of invalid) {
    assert.equal(isGiftSelectionValid(gift, chosen), false);
    assert.deepEqual(restoreCart([{ product: gift, quantity: 1, selection: chosen }]), []);
    assert.equal(itemPrice({ product: gift, selection: chosen }), null);
  }
  const restored = restoreCart([{ product: gift, quantity: 2, selection }, { product: gift, quantity: 3, selection: [...selection].reverse() }]);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].quantity, 5);
  assert.equal(itemPrice(restored[0]), selection.reduce((sum, id) => sum + products.find(p => p.id === id)!.price!, 0));
});

test("custom cart rows validate recipes and preserve unsupported legacy types for the existing warning", () => {
  const custom = { name: "나의 향", counts: { rose: 2 }, label: "paper", color: "#aabbcc" };
  const row = { product: customProduct(custom.name), quantity: 1, custom };
  assert.deepEqual(restoreCart([{ ...row, custom: { ...custom, counts: { rose: 21 } } }]), []);
  const restored = restoreCart([row, { ...row, custom: { ...custom, counts: { rose: 2, bergamot: 0 } } }]);
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

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
beforeEach(() => Object.defineProperty(globalThis, "localStorage", { configurable: true, value: new MemoryStorage() }));
after(() => {
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
});

test("malformed account records cannot crash sign-in or create a session", async () => {
  localStorage.setItem("aura_members_v2", JSON.stringify([null, {}, { email: "a@example.com" }]));
  localStorage.setItem(accounts.SESSION, JSON.stringify({ email: "a@example.com" }));
  assert.equal(accounts.current(), null);
  await assert.rejects(accounts.login("a@example.com", "password123"), /이메일 또는 비밀번호/);
  localStorage.setItem("aura_members_v2", "invalid json");
  assert.equal(accounts.current(), null);
});

test("registration and sign-in return canonical member data without password verification fields", async () => {
  const member = await accounts.register(" AURA ", " HELLO@example.com ", "password123", true);
  assert.deepEqual(member, { name: "AURA", email: "hello@example.com", coupon: true, marketing: true });
  localStorage.setItem(accounts.SESSION, JSON.stringify({ email: member.email, name: {}, coupon: false, hash: "forged" }));
  assert.deepEqual(accounts.current(), member);
  accounts.logout();
  assert.equal(accounts.current(), null);
  await assert.rejects(accounts.login(member.email, "wrong-password"), /이메일 또는 비밀번호/);
  assert.deepEqual(await accounts.login(member.email, "password123"), member);
  await assert.rejects(accounts.register("Duplicate", member.email, "password123"), /이미 가입/);
});

test("overlapping registrations in one tab cannot append the same email twice", async () => {
  const results = await Promise.allSettled([
    accounts.register("First", "same@example.com", "password123"),
    accounts.register("Second", "same@example.com", "password123"),
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(JSON.parse(localStorage.getItem("aura_members_v2")!).length, 1);
});
