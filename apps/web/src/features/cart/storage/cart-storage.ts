import type { Catalog } from "@/features/catalog/model/catalog";
import { restoreCart, type CartItem } from "@/features/cart/model/cart";

export const CART_STORAGE_KEY = "aura_cart_v1";
const CART_CHANGED = "aura:cart-changed";

export function cartSnapshot(): string | null {
  try {
    return window.localStorage.getItem(CART_STORAGE_KEY);
  } catch {
    return null;
  }
}
export const serverCartSnapshot = () => undefined;

export function subscribeCart(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === CART_STORAGE_KEY || event.key === null) {
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CART_CHANGED, listener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CART_CHANGED, listener);
  };
}

export function restoreStoredCart(
  snapshot: string | null | undefined,
  catalog: Catalog,
): CartItem[] {
  try {
    return restoreCart(snapshot ? JSON.parse(snapshot) : [], catalog);
  } catch {
    return [];
  }
}

/** Store identities and selections; prices always come from the current catalog. */
export function writeCart(items: CartItem[]) {
  const stored = items.map(({ product, quantity, selection, custom }) => ({
    product: { id: product.id, ...(custom ? { type: product.type } : {}) },
    quantity,
    selection,
    ...(custom ? { custom } : {}),
  }));
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    throw new Error("브라우저 저장 공간을 확인해 주세요. 장바구니를 저장하지 못했어요.");
  }

  window.dispatchEvent(new Event(CART_CHANGED));
}
