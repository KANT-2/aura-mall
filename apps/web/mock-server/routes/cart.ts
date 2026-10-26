import { Router } from "express";
import { MAX_QUANTITY, restoreCart } from "@/features/cart/model/cart";
import { isGiftSelectionValid } from "@/features/cart/model/pricing";
import { mixColor } from "@/features/atelier/model/recipes";
import { isRecord } from "@/lib/validation";
import { catalog, type MockDatabase } from "../data/store";
import { resolveSession } from "../session";
import { HttpError, requireJsonBody } from "../http";
import { assertCartStock, serializeCart } from "../cart";

export function cartRoutes(database: MockDatabase) {
  const router = Router();
  router.get("/cart", (req, res) => {
    const { owner } = resolveSession(req, res, database);
    res.json(serializeCart(restoreCart(database.state.carts[owner] ?? [], catalog)));
  });
  router.post("/cart/items", requireJsonBody, (req, res) => {
    const { owner } = resolveSession(req, res, database);
    const { productId, custom } = req.body;
    if (
      (productId !== undefined) === (custom !== undefined) ||
      (custom !== undefined && !isRecord(custom))
    ) {
      throw new HttpError(400, "상품 또는 맞춤 조향 중 하나를 선택해 주세요.");
    }

    const quantity = req.body.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      throw new HttpError(400, "수량을 확인해 주세요.");
    }

    const product = catalog.products.find((item) => item.id === productId);
    if (!custom && (!product || product.stock < 1)) {
      throw new HttpError(400, "현재 선택할 수 없는 상품이에요.");
    }

    const selection = Array.isArray(req.body.selection) ? req.body.selection : [];
    if (
      product?.type === "gift-set" &&
      !isGiftSelectionValid(product, selection, catalog.products)
    ) {
      throw new HttpError(400, "같은 컬렉션의 제품 3개를 선택해 주세요.");
    }

    if (custom && custom.productType && custom.productType !== "eau-de-parfum") {
      throw new HttpError(400, "맞춤 조향은 현재 오 드 퍼퓸 50mL만 제공해요.");
    }

    const [item] = restoreCart(
      [{ product: custom ? { id: "custom-atelier" } : product, custom, quantity, selection }],
      catalog,
    );
    if (!item) {
      throw new HttpError(400, "향 이름과 향료 조합을 확인해 주세요.");
    }

    if (item.custom) {
      item.custom.color = mixColor(item.custom.counts, catalog.ingredients);
    }

    const previous = restoreCart(database.state.carts[owner] ?? [], catalog);
    const existing = previous.find((row) => row.key === item.key);
    const items = existing
      ? previous.map((row) =>
          row.key === item.key ? { ...row, quantity: row.quantity + item.quantity } : row,
        )
      : [...previous, item];
    assertCartStock(items);
    database.state.carts[owner] = items;
    database.persist();
    res.status(201).json(serializeCart(database.state.carts[owner]));
  });
  router.patch("/cart/items/:key", requireJsonBody, (req, res) => {
    const { owner } = resolveSession(req, res, database);
    const quantity = req.body.quantity;
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_QUANTITY) {
      throw new HttpError(400, "수량을 확인해 주세요.");
    }

    const key = String(req.params.key);
    const items = database.state.carts[owner] ?? [];
    if (!items.some((item) => item.key === key)) {
      throw new HttpError(404, "장바구니 상품을 찾을 수 없어요.");
    }

    const updated =
      quantity === 0
        ? items.filter((item) => item.key !== key)
        : items.map((item) => (item.key === key ? { ...item, quantity } : item));
    assertCartStock(updated);
    database.state.carts[owner] = updated;
    database.persist();
    res.json(serializeCart(database.state.carts[owner]));
  });
  return router;
}
