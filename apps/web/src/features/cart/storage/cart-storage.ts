import type { Catalog } from "@/features/catalog/model/catalog";
import { restoreCart, type CartItem } from "@/features/cart/model/cart";

export const CART_STORAGE_KEY = "aura_cart_v1";
export type CartOwner = { memberId: string } | "guest";
export const cartStorageKey = (owner: CartOwner) =>
  owner === "guest"
    ? "aura_cart_v2:guest"
    : `aura_cart_v2:member:${encodeURIComponent(owner.memberId)}`;
const CART_CHANGED = "aura:cart-changed";
const retiredKey = (memberId: string) => `aura_cart_v2:retired:${encodeURIComponent(memberId)}`;

export function cartSnapshot(owner: CartOwner): string | null {
  try {
    if (owner !== "guest" && window.localStorage.getItem(retiredKey(owner.memberId))) {
      return null;
    }

    return window.localStorage.getItem(cartStorageKey(owner));
  } catch {
    return null;
  }
}
export const serverCartSnapshot = () => undefined;

export function subscribeCart(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith("aura_cart_v2:") || event.key === null) {
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
export function writeCart(items: CartItem[], owner: CartOwner) {
  const stored = items.map(({ product, quantity, selection, custom }) => ({
    product: { id: product.id, ...(custom ? { type: product.type } : {}) },
    quantity,
    selection,
    ...(custom ? { custom } : {}),
  }));
  try {
    if (owner !== "guest" && window.localStorage.getItem(retiredKey(owner.memberId))) {
      throw new Error("이 계정의 장바구니는 사용할 수 없어요.");
    }

    window.localStorage.setItem(cartStorageKey(owner), JSON.stringify(stored));
    if (owner !== "guest" && window.localStorage.getItem(retiredKey(owner.memberId))) {
      window.localStorage.removeItem(cartStorageKey(owner));
      throw new Error("이 계정의 장바구니는 사용할 수 없어요.");
    }
  } catch {
    throw new Error("브라우저 저장 공간을 확인해 주세요. 장바구니를 저장하지 못했어요.");
  }

  window.dispatchEvent(new Event(CART_CHANGED));
}

/** Called only after the matching BFF DELETE succeeds with 204. Legacy/guest keys stay. */
export function removeMemberCart(memberId: string): boolean {
  try {
    window.localStorage.setItem(retiredKey(memberId), "1");
    window.localStorage.removeItem(cartStorageKey({ memberId }));
    window.dispatchEvent(new Event(CART_CHANGED));
    return true;
  } catch {
    return false;
  }
}
