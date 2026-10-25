import { request } from "@/lib/api/client";
import type { CartItem, CustomRecipeItem } from "../model/cart";

export type CartCommand =
  | {
      type: "add";
      productId?: string;
      quantity: number;
      selection?: string[];
      custom?: CustomRecipeItem;
    }
  | { type: "quantity"; key: string; quantity: number };
export const cartKey = (owner?: string) => ["cart", owner] as const;
export const getCart = (signal?: AbortSignal) => request<CartItem[]>("/cart", { signal });
export function mutateCart(command: CartCommand, owner?: string) {
  return command.type === "quantity"
    ? request<CartItem[]>(`/cart/items/${encodeURIComponent(command.key)}`, {
        method: "PATCH",
        headers: owner ? { "X-Session-Owner": owner } : undefined,
        body: JSON.stringify({ quantity: command.quantity }),
      })
    : request<CartItem[]>("/cart/items", {
        method: "POST",
        headers: owner ? { "X-Session-Owner": owner } : undefined,
        body: JSON.stringify(command),
      });
}
