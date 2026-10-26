import type { Catalog } from "@/features/catalog/model/catalog";
import {
  MAX_QUANTITY,
  restoreCart,
  type CartItem,
  type CustomRecipeItem,
} from "@/features/cart/model/cart";
import { mixColor } from "@/features/atelier/model/recipes";
import { isRecord } from "@/lib/validation";

export type CartInput = { quantity: number; selection?: string[] } & (
  { productId: string; custom?: never } | { custom: CustomRecipeItem; productId?: never }
);
export type CartCommand =
  ({ type: "add" } & CartInput) | { type: "quantity"; key: string; quantity: number };

export class CartError extends Error {}

/** Count single products and Gift Set contents against the same catalog stock. */
export function assertCartStock(items: CartItem[], products: Catalog["products"]) {
  const quantities = new Map<string, number>();
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY) {
      throw new CartError("수량을 확인해 주세요.");
    }

    if (item.custom) {
      continue;
    }

    for (const id of [item.product.id, ...item.selection]) {
      quantities.set(id, (quantities.get(id) ?? 0) + item.quantity);
    }
  }

  for (const [id, quantity] of quantities) {
    const product = products.find((product) => product.id === id);
    if (!product || quantity > product.stock) {
      throw new CartError("상품 재고를 확인해 주세요.");
    }
  }
}

/** Validate new input; restoring persisted rows alone would silently clamp quantities. */
export function addCartItem(items: CartItem[], input: unknown, catalog: Catalog): CartItem[] {
  if (!isRecord(input)) {
    throw new CartError("상품 정보를 확인해 주세요.");
  }

  const { productId, custom, quantity } = input;
  if (
    (productId !== undefined) === (custom !== undefined) ||
    (custom !== undefined && !isRecord(custom))
  ) {
    throw new CartError("상품 또는 맞춤 조향 중 하나를 선택해 주세요.");
  }

  if (
    typeof quantity !== "number" ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_QUANTITY
  ) {
    throw new CartError("수량을 확인해 주세요.");
  }

  if (
    isRecord(custom) &&
    custom.productType !== undefined &&
    custom.productType !== "eau-de-parfum"
  ) {
    throw new CartError("맞춤 조향은 현재 오 드 퍼퓸 50mL만 제공해요.");
  }

  const [item] = restoreCart(
    [
      {
        product: { id: custom ? "custom-atelier" : productId },
        custom,
        quantity,
        selection: input.selection,
      },
    ],
    catalog,
  );
  if (!item) {
    throw new CartError("상품과 향료 구성을 확인해 주세요.");
  }

  if (item.custom) {
    item.custom.color = mixColor(item.custom.counts, catalog.ingredients);
  }

  const exists = items.some((row) => row.key === item.key);
  const updated = exists
    ? items.map((row) =>
        row.key === item.key ? { ...row, quantity: row.quantity + item.quantity } : row,
      )
    : [...items, item];
  assertCartStock(updated, catalog.products);
  return updated;
}

export function applyCartCommand(
  items: CartItem[],
  command: CartCommand,
  catalog: Catalog,
): CartItem[] {
  if (command.type === "add") {
    return addCartItem(items, command, catalog);
  }

  const { key, quantity } = command;
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_QUANTITY) {
    throw new CartError("수량을 확인해 주세요.");
  }

  if (!items.some((item) => item.key === key)) {
    throw new CartError("장바구니 상품을 찾을 수 없어요.");
  }

  const updated =
    quantity === 0
      ? items.filter((item) => item.key !== key)
      : items.map((item) => (item.key === key ? { ...item, quantity } : item));
  assertCartStock(updated, catalog.products);
  return updated;
}
