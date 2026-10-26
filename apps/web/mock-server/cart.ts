import type { CartItem } from "@/features/cart/model/cart";
import type { Catalog } from "@/features/catalog/model/catalog";
import { addCartItem, CartError } from "@/features/cart/model/cart-commands";
import { itemPrice } from "@/features/cart/model/pricing";
import { HttpError } from "./http";

/** Rebuild an order from client selections; never trust local prices or product objects. */
export function orderItems(input: unknown, catalog: Catalog): CartItem[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new HttpError(400, "주문할 상품을 확인해 주세요.");
  }

  let items: CartItem[] = [];
  try {
    for (const item of input) {
      items = addCartItem(items, item, catalog);
    }
  } catch (error) {
    if (error instanceof CartError) {
      throw new HttpError(400, error.message);
    }

    throw error;
  }

  return items.map((item) => ({ ...item, unitPrice: itemPrice(item, catalog.products) }));
}
