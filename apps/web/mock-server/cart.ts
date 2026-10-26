import { MAX_QUANTITY, type CartItem } from "@/features/cart/model/cart";
import { itemPrice } from "@/features/cart/model/pricing";
import { catalog } from "./data/store";
import { HttpError } from "./http";

export const serializeCart = (items: CartItem[]) =>
  items.map((item) => ({ ...item, unitPrice: itemPrice(item, catalog.products) }));

/** Gift selections and individual products share the same fixture stock. */
export function assertCartStock(items: CartItem[]) {
  const quantities = new Map<string, number>();
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY) {
      throw new HttpError(400, "수량을 확인해 주세요.");
    }

    if (item.custom) {
      continue;
    }

    for (const id of [item.product.id, ...item.selection]) {
      quantities.set(id, (quantities.get(id) ?? 0) + item.quantity);
    }
  }

  for (const [id, quantity] of quantities) {
    const product = catalog.products.find((product) => product.id === id);
    if (!product || quantity > product.stock) {
      throw new HttpError(400, "상품 재고를 확인해 주세요.");
    }
  }
}
