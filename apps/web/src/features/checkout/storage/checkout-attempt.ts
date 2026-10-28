import type { Catalog } from "@/features/catalog/model/catalog";
import type { AccountState } from "@/features/account/model/account";
import type { Order } from "@/features/checkout/model/order";
import { request, withAuthLock } from "@/lib/api/client";
import { cartSnapshot, restoreStoredCart, writeCart } from "@/features/cart/storage/cart-storage";
import type { CartItem } from "@/features/cart/model/cart";

export async function checkoutKey(owner: string, body: unknown) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(body)),
  );
  const fingerprint = Array.from(new Uint8Array(bytes), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
  const storageKey = `aura-checkout-attempt:${owner}`;
  let previous: { fingerprint?: string; key?: string; orderId?: string } | null = null;
  try {
    previous = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
  } catch {
    /* A fresh attempt replaces corrupt local state. */
  }
  if (previous?.fingerprint === fingerprint && typeof previous.key === "string") {
    if (!previous.orderId) {
      return previous.key;
    }

    const orders = await request<Order[]>("/orders", { headers: { "X-Account-Owner": owner } });
    if (
      orders.some(
        (order) => order.id === previous.orderId && (!order.status || order.status === "received"),
      )
    ) {
      return previous.key;
    }
  }

  const key = crypto.randomUUID();
  sessionStorage.setItem(storageKey, JSON.stringify({ fingerprint, key }));
  return key;
}
export function rememberCheckout(orderId: string, owner: string, cart: CartItem[]) {
  try {
    const attemptKey = `aura-checkout-attempt:${owner}`;
    const attempt = JSON.parse(sessionStorage.getItem(attemptKey) ?? "null");
    if (attempt) {
      sessionStorage.setItem(attemptKey, JSON.stringify({ ...attempt, orderId }));
    }

    const key = `aura-checkout-lines:${owner}:${orderId}`;
    if (!localStorage.getItem(key)) {
      localStorage.setItem(
        key,
        JSON.stringify(cart.map(({ key, quantity }) => ({ key, quantity }))),
      );
    }
  } catch {
    /* Order completion must not depend on browser storage availability. */
  }
}

export async function completeCheckout(orderId: string, catalog: Catalog) {
  return withAuthLock(async () => {
    const response = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) {
      return;
    }

    const owner = ((await response.json()) as AccountState).user?.id;
    if (!owner) {
      return;
    }

    const key = `aura-checkout-lines:${owner}:${orderId}`;
    const raw = localStorage.getItem(key);
    if (!raw || raw === "done") {
      return;
    }

    const lines: unknown = JSON.parse(raw);
    if (!Array.isArray(lines)) {
      return;
    }

    const purchased = new Map<string, number>();
    for (const line of lines) {
      if (
        typeof line?.key === "string" &&
        Number.isInteger(line.quantity) &&
        line.quantity > 0 &&
        line.quantity <= 15
      ) {
        purchased.set(line.key, line.quantity);
      }
    }

    const cartOwner = { memberId: owner };
    const cart = restoreStoredCart(cartSnapshot(cartOwner), catalog);
    // Keep changed lines: a customer may have edited the cart while the PG window was open.
    writeCart(
      cart.filter((item) => purchased.get(item.key) !== item.quantity),
      cartOwner,
    );
    localStorage.setItem(key, "done");
  });
}
