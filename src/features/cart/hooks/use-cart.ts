"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/features/account/hooks/use-session";
import { useNotify } from "@/components/feedback/notification-provider";
import type { Product } from "@/features/catalog/model/catalog";
import type { CustomRecipeItem } from "@/features/cart/model/cart";
import { cartKey, getCart, mutateCart, type CartCommand } from "@/features/cart/api/cart";

export function useCart() {
  const { owner, ready: sessionReady } = useSession();
  const client = useQueryClient();
  const notify = useNotify();
  const key = cartKey(owner);
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => getCart(signal),
    enabled: sessionReady,
    throwOnError: true,
  });
  const mutation = useMutation({
    mutationFn: ({ command, owner }: { command: CartCommand; owner: string }) =>
      mutateCart(command, owner),
    scope: { id: `cart:${owner}` },
    async onSuccess(items, variables) {
      const queryKey = cartKey(variables.owner);
      await client.cancelQueries({ queryKey });
      client.setQueryData(queryKey, items);
    },
  });
  async function execute(command: CartCommand, message?: string) {
    if (!sessionReady || !owner) {
      return false;
    }
    try {
      await mutation.mutateAsync({ command, owner });
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
    cart: query.data ?? [],
    ready: sessionReady && query.isSuccess,
    pending: mutation.isPending,
    error: query.error,
    add: (product: Product, quantity: number, selection: string[] = []) =>
      execute({ type: "add", productId: product.id, quantity, selection }, "장바구니에 담았어요."),
    addCustom: (custom: CustomRecipeItem) =>
      execute({ type: "add", custom, quantity: 1 }, "나만의 향을 장바구니에 담았어요."),
    quantity: (key: string, quantity: number) => execute({ type: "quantity", key, quantity }),
  };
}
