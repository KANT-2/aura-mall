import assert from "node:assert/strict";
import { test } from "node:test";
import { cartKey, createBrowserStore, recipesKey } from "../lib/aura/browser-store";
import { products } from "../lib/aura/catalog";
import { restoreCart } from "../lib/aura/cart";
import { restoreRecipes } from "../lib/aura/recipes";

function memoryStorage() {
  const values = new Map<string, string>();
  const writes: string[] = [];
  return {
    writes,
    getItem: (key: string) => values.get(key) ?? null,
    setItem(key: string, value: string) {
      writes.push(key);
      values.set(key, value);
    },
  };
}

const cart = restoreCart([{ product: products[0], quantity: 2 }]);
const [recipe] = restoreRecipes([{ id: "one", name: "나의 향", counts: { rose: 2 } }]);

test("guest and member carts stay separate, retaining the existing owner-key contract", () => {
  const storage = memoryStorage();
  const store = createBrowserStore(() => storage);
  assert.equal(cartKey(), "aura_cart_v3_guest");
  assert.equal(cartKey("a@example.com"), "aura_cart_v3_member:a@example.com");
  assert.equal(recipesKey("a@example.com"), "aura_recipes_v2_a@example.com");
  store.persistCart(cartKey(), cart);
  store.persistCart(cartKey("a@example.com"), [{ ...cart[0], quantity: 5 }]);
  assert.equal(store.loadCart()[0].quantity, 2);
  assert.equal(store.loadCart("a@example.com")[0].quantity, 5);
  assert.deepEqual(store.loadCart("b@example.com"), []);
  storage.setItem("aura_cart_v2", JSON.stringify(cart));
  assert.deepEqual(store.loadCart("b@example.com"), []);
});

test("unchanged cart writes do not cause storage-event echoes", () => {
  const storage = memoryStorage();
  const store = createBrowserStore(() => storage);
  store.persistCart(cartKey(), cart);
  store.persistCart(cartKey(), cart);
  assert.deepEqual(storage.writes, [cartKey()]);
});

test("invalid JSON and unavailable browser storage have safe read fallbacks", () => {
  const storage = memoryStorage();
  storage.setItem(cartKey(), "broken json");
  storage.setItem(recipesKey(), "null");
  const store = createBrowserStore(() => storage);
  assert.deepEqual(store.loadCart(), []);
  assert.deepEqual(store.loadRecipes(), []);
  const blocked = createBrowserStore(() => { throw Error("Storage unavailable"); });
  assert.deepEqual(blocked.loadCart(), []);
  assert.deepEqual(blocked.loadRecipes(), []);
  assert.throws(() => blocked.persistCart(cartKey(), cart), /Storage unavailable/);
});

test("recipe saves read the latest persisted data and update matching IDs without duplicates", () => {
  const storage = memoryStorage();
  const firstTab = createBrowserStore(() => storage);
  const secondTab = createBrowserStore(() => storage);
  firstTab.saveRecipe("a@example.com", recipe);
  secondTab.saveRecipe("a@example.com", { ...recipe, id: "two", name: "두 번째 향" });
  const updated = firstTab.saveRecipe("a@example.com", { ...recipe, name: "수정한 향" });
  assert.deepEqual(updated.map(({ id, name }) => ({ id, name })), [
    { id: "one", name: "수정한 향" },
    { id: "two", name: "두 번째 향" },
  ]);
  assert.deepEqual(firstTab.loadRecipes("b@example.com"), []);
  assert.deepEqual(firstTab.loadRecipes(), []);
});

test("write failures and invalid recipes cannot be reported as successful saves", () => {
  const blocked = createBrowserStore(() => ({
    getItem: () => null,
    setItem: () => { throw Error("Quota exceeded"); },
  }));
  assert.throws(() => blocked.saveRecipe(null, recipe), /Quota exceeded/);
  const storage = memoryStorage();
  const store = createBrowserStore(() => storage);
  assert.throws(() => store.saveRecipe(null, { ...recipe, counts: { rose: 21 } }));
  assert.deepEqual(storage.writes, []);
});
