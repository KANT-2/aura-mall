"use client";
import { useMemo, useSyncExternalStore } from "react";
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
} from "@/features/cart/storage/cart-storage";

export function useCart() {
  const catalog = useCatalog();
  const notify = useNotify();
  const snapshot = useSyncExternalStore(subscribeCart, cartSnapshot, serverCartSnapshot);
  const cart = useMemo(() => restoreStoredCart(snapshot, catalog), [snapshot, catalog]);
  async function execute(command: CartCommand, message?: string) {
    try {
      // Read at command time so multiple components do not overwrite one another's updates.
      const current = restoreStoredCart(cartSnapshot(), catalog);
      writeCart(applyCartCommand(current, command, catalog));
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
