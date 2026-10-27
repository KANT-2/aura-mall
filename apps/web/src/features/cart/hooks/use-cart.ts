"use client";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useAccount } from "@/features/account/hooks/use-account";
import type { AccountState } from "@/features/account/model/account";
import { withAuthLock } from "@/lib/api/client";
import { useNotify } from "@/components/feedback/notification-provider";
import type { Product } from "@/features/catalog/model/catalog";
import type { CustomRecipeItem } from "@/features/cart/model/cart";
import { useCatalog } from "@/features/catalog/hooks/use-catalog";
import { applyCartCommand, type CartCommand } from "@/features/cart/model/cart-commands";
import {
  cartSnapshot,
  serverCartSnapshot,
  subscribeCart,
  restoreStoredCart,
  writeCart,
  type CartOwner,
} from "@/features/cart/storage/cart-storage";

export function useCart() {
  const catalog = useCatalog();
  const notify = useNotify();
  const account = useAccount();
  const memberId = account.user?.id;
  const owner: CartOwner = useMemo(() => (memberId ? { memberId } : "guest"), [memberId]);
  const getSnapshot = useCallback(
    () => (account.ready ? cartSnapshot(owner) : undefined),
    [account.ready, owner],
  );
  const snapshot = useSyncExternalStore(subscribeCart, getSnapshot, serverCartSnapshot);
  const cart = useMemo(() => restoreStoredCart(snapshot, catalog), [snapshot, catalog]);
  async function execute(command: CartCommand, message?: string) {
    try {
      // Read at command time so multiple components do not overwrite one another's updates.
      await withAuthLock(async () => {
        if (!account.ready) {
          throw new Error("계정 상태를 확인한 뒤 다시 시도해 주세요.");
        }

        // The same cross-tab lock serializes login/withdrawal and cart writes. Recheck the
        // BFF identity under that lock so a stale tab cannot recreate a retired owner's cart.
        const response = await fetch("/api/auth/me", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("계정 상태를 확인하지 못했어요. 새로고침 후 다시 시도해 주세요.");
        }

        const currentAccount = (await response.json()) as AccountState;
        if ((currentAccount.user?.id ?? null) !== (memberId ?? null)) {
          throw new Error("계정이 변경됐어요. 새로고침 후 다시 시도해 주세요.");
        }

        const current = restoreStoredCart(cartSnapshot(owner), catalog);
        writeCart(applyCartCommand(current, command, catalog), owner);
      });
      if (message) {
        notify(message);
      }

      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "장바구니를 변경하지 못했어요.");
      return false;
    }
  }
  return {
    cart,
    ready: snapshot !== undefined,
    pending: false,
    add: (product: Product, quantity: number, selection: string[] = []) =>
      execute({ type: "add", productId: product.id, quantity, selection }, "장바구니에 담았어요."),
    addCustom: (custom: CustomRecipeItem) =>
      execute({ type: "add", custom, quantity: 1 }, "나만의 향을 장바구니에 담았어요."),
    quantity: (key: string, quantity: number) => execute({ type: "quantity", key, quantity }),
  };
}
