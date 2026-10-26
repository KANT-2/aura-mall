import { randomUUID } from "node:crypto";
import { Router } from "express";
import { restoreCart } from "@/features/cart/model/cart";
import { itemPrice, shippingFee } from "@/features/cart/model/pricing";
import { catalog, type MockDatabase } from "../data/store";
import { resolveSession } from "../session";
import { HttpError, requireString } from "../http";

export function checkoutRoutes(database: MockDatabase) {
  const router = Router();
  router.get("/orders", (req, res) => {
    const { owner, user } = resolveSession(req, res, database);
    if (!user) {
      throw new HttpError(401, "로그인이 필요해요.");
    }

    res.json(
      database.state.orders
        .filter((order) => order.owner === owner)
        .map(({ id, items, total, recipient, address, created }) => ({
          id,
          items,
          total,
          recipient,
          address,
          created,
        })),
    );
  });
  router.post("/orders", (req, res) => {
    const { owner, user } = resolveSession(req, res, database);
    const items = restoreCart(database.state.carts[owner] ?? [], catalog);
    if (!items.length) {
      throw new HttpError(400, "주문할 상품이 없어요.");
    }

    const prices = items.map((item) => itemPrice(item, catalog.products));
    if (prices.some((price) => price === null)) {
      throw new HttpError(400, "주문 금액을 확인해 주세요.");
    }

    const recipient = requireString(req.body.recipient, "받는 분을 입력해 주세요.", 100);
    const address = requireString(req.body.address, "주소를 입력해 주세요.", 500);
    if (req.body.coupon && !user?.coupon) {
      throw new HttpError(400, "사용할 수 없는 쿠폰이에요.");
    }

    const subtotal = items.reduce((sum, item, index) => sum + prices[index]! * item.quantity, 0);
    const order = {
      id: randomUUID(),
      owner,
      items,
      recipient,
      address,
      total: subtotal + shippingFee(subtotal, Boolean(req.body.coupon)),
      created: new Date().toISOString(),
    };
    database.state.orders.unshift(order);
    database.state.carts[owner] = [];
    if (req.body.coupon && user) {
      database.state.accounts[user.id].coupon = false;
    }

    database.persist();
    res.status(201).json({
      id: order.id,
      items,
      total: order.total,
      recipient,
      address,
      created: order.created,
    });
  });
  router.post("/partner", (req, res) => {
    const required = ["brand", "name", "email", "introduction", "message", "type"];
    const values = Object.fromEntries(
      required.map((key) => [key, requireString(req.body[key], "필수 입력 항목을 확인해 주세요.")]),
    );
    if (!/^\S+@\S+\.\S+$/.test(values.email) || req.body.consent !== "on") {
      throw new HttpError(400, "필수 입력 항목과 동의를 확인해 주세요.");
    }

    const inquiry = {
      id: randomUUID(),
      ...values,
      website: req.body.website ?? "",
      created: new Date().toISOString(),
    };
    database.state.inquiries.push(inquiry);
    database.persist();
    res.status(201).json({ id: inquiry.id });
  });
  return router;
}
