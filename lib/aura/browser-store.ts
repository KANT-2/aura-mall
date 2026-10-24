import { restoreCart, type CartItem } from "./cart";
import { restoreRecipes, type Recipe } from "./recipes";

export type StoragePort = Pick<Storage, "getItem" | "setItem">;

// The owner of an in-memory cart is explicit, independent of the current session.
// The ownerless legacy aura_cart_v2 key is deliberately not migrated.
export const cartKey = (email?: string | null) =>
  "aura_cart_v3_" + (email ? "member:" + email : "guest");
export const recipesKey = (email?: string | null) =>
  "aura_recipes_v2_" + (email || "guest");

/** Browser persistence adapter; the storage port is replaceable in tests. */
export function createBrowserStore(getStorage: () => StoragePort) {
  function loadRecipes(email?: string | null): Recipe[] {
    try {
      return restoreRecipes(JSON.parse(getStorage().getItem(recipesKey(email)) || "[]"));
    } catch {
      return [];
    }
  }

  return {
    loadCart(email?: string | null): CartItem[] {
      try {
        return restoreCart(JSON.parse(getStorage().getItem(cartKey(email)) || "[]"));
      } catch {
        return [];
      }
    },
    persistCart(ownerKey: string, cart: CartItem[]): void {
      const storage = getStorage();
      const json = JSON.stringify(cart);
      // Avoid bouncing identical storage events between tabs.
      if (storage.getItem(ownerKey) !== json) storage.setItem(ownerKey, json);
    },
    loadRecipes,
    saveRecipe(email: string | null | undefined, recipe: Recipe): Recipe[] {
      const [validated] = restoreRecipes([recipe]);
      if (!validated) throw Error("향 이름과 향료 조합을 확인해 주세요.");
      const next = [validated, ...loadRecipes(email).filter(item => item.id !== validated.id)];
      // Write failures propagate so the UI cannot report a successful save.
      getStorage().setItem(recipesKey(email), JSON.stringify(next));
      return next;
    },
  };
}

// Delay access until hydration or an event handler; importing is safe during SSR.
export const browserStore = createBrowserStore(() => window.localStorage);
