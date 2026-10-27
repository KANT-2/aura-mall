import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fixture from "../../mock-server/fixtures/catalog.json";
import type { Catalog } from "@/features/catalog/model/catalog";
import { addCartItem } from "@/features/cart/model/cart-commands";
import {
  CART_STORAGE_KEY,
  cartStorageKey,
  cartSnapshot,
  writeCart,
  removeMemberCart,
} from "@/features/cart/storage/cart-storage";
import { request } from "@/lib/api/client";

let stored: Map<string, string>;
beforeEach(() => {
  stored = new Map();
  const storage = {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  };
  vi.stubGlobal("window", Object.assign(new EventTarget(), { localStorage: storage }));
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("navigator", {});
});
afterEach(() => vi.unstubAllGlobals());
const alice = { memberId: "alice" },
  bob = { memberId: "bob" };

it("isolates guest/member buckets and restores each owner without adopting legacy data", () => {
  stored.set(CART_STORAGE_KEY, "unknown-owner");
  const items = addCartItem([], { productId: "fresh-hand-cream", quantity: 2 }, fixture as Catalog);
  writeCart(items, alice);
  expect(cartSnapshot(bob)).toBeNull();
  expect(cartSnapshot("guest")).toBeNull();
  const previous = cartSnapshot(alice);
  writeCart([], bob);
  expect(cartSnapshot(alice)).toBe(previous);
  expect(stored.get(CART_STORAGE_KEY)).toBe("unknown-owner");
});

it("deletes only a matching member bucket, never guest, other members or legacy data", () => {
  for (const key of [
    CART_STORAGE_KEY,
    cartStorageKey("guest"),
    cartStorageKey(alice),
    cartStorageKey(bob),
  ]) {
    stored.set(key, "saved");
  }

  expect(removeMemberCart("alice")).toBe(true);
  expect(cartSnapshot(alice)).toBeNull();
  expect(cartSnapshot(bob)).toBe("saved");
  expect(cartSnapshot("guest")).toBe("saved");
  expect(stored.get(CART_STORAGE_KEY)).toBe("saved");
});

it.each([400, 403, 503, 200, 204])(
  "cleans the member cart only after DELETE 204, status %s",
  async (status) => {
    stored.set(cartStorageKey(alice), "saved");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        status === 204
          ? new Response(null, { status })
          : Response.json(status >= 400 ? { error: { message: "Denied" } } : {}, { status }),
      ),
    );
    const operation = request("/auth/me", {
      method: "DELETE",
      headers: { "X-Account-Owner": "alice" },
    });
    if (status >= 400) {
      await expect(operation).rejects.toMatchObject({ status });
    } else if (status === 200) {
      await expect(operation).rejects.toMatchObject({ status: 502 });
    } else {
      await operation;
    }

    expect(cartSnapshot(alice)).toBe(status === 204 ? null : "saved");
  },
);

it("never recreates a retired owner's cart after a delayed write", () => {
  removeMemberCart("alice");
  expect(() => writeCart([], alice)).toThrow();
  expect(cartSnapshot(alice)).toBeNull();
  expect(stored.has(cartStorageKey(alice))).toBe(false);
});

it("preserves carts on logout and password change", async () => {
  stored.set(cartStorageKey(alice), "saved");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 204 })),
  );
  await request("/auth/logout", { method: "POST" });
  await request("/auth/change-password", {
    method: "POST",
    headers: { "X-Account-Owner": "alice" },
  });
  expect(cartSnapshot(alice)).toBe("saved");
});
