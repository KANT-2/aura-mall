import { randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import type { Member } from "@/features/account/model/account";
import type { Product } from "@/features/catalog/model/catalog";
import {
  ADMIN_PAGE_SIZE,
  LOW_STOCK,
  MAX_STOCK,
  adminPageNumber,
  inquiryStatuses,
  isDateInput,
  type AdminInquiry,
  type AdminInquirySummary,
  type AdminOrder,
  type AdminOrderSummary,
  type AdminPage,
  type AdminProduct,
  type AdminProductDetail,
  type InquiryStatus,
} from "@/features/admin/model/admin";
import {
  catalog,
  type AuditRecord,
  type Inquiry,
  type MockDatabase,
  type Order,
} from "../data/store";
import { HttpError, requireJsonBody, requireString } from "../http";
import { requireAdmin } from "../session";

const imageOptions = [...new Set(catalog.products.map((product) => product.image))].sort();
const RECENT_DAYS = 7;
const conflict = () =>
  new HttpError(
    409,
    "다른 작업으로 정보가 변경되었어요. 최신 내용을 확인한 뒤 다시 시도해 주세요.",
  );

function paginate<T>(items: T[], page: number): AdminPage<T> {
  const start = (page - 1) * ADMIN_PAGE_SIZE;
  return {
    items: items.slice(start, start + ADMIN_PAGE_SIZE),
    total: items.length,
    page,
    pageSize: ADMIN_PAGE_SIZE,
  };
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const queryText = (request: Request, name: string) => text(request.query[name]).slice(0, 100);
function requireVersion(value: unknown, current: number) {
  if (!Number.isInteger(value)) {
    throw new HttpError(400, "수정 기준 버전을 확인해 주세요.");
  }

  if (value !== current) {
    throw conflict();
  }
}

export function adminRoutes(database: MockDatabase) {
  const router = Router();
  const { state } = database;
  const versionOf = (id: string) => state.productVersions[id] ?? { version: 1, updated: "" };
  const findProduct = (id: string) => {
    const product = state.products.find((item) => item.id === id);
    if (!product) {
      throw new HttpError(404, "상품을 찾을 수 없어요.");
    }

    return product;
  };
  const adminProduct = (product: Product): AdminProduct => {
    const { version, updated } = versionOf(product.id);
    return {
      id: product.id,
      collection: product.collection,
      type: product.type,
      typeName: product.typeName,
      name: product.name,
      englishName: product.englishName,
      volume: product.volume,
      price: product.price,
      stock: product.stock,
      image: product.image,
      description: product.description,
      featured: product.featured,
      isNew: product.isNew,
      version,
      updated: updated || null,
    };
  };
  const history = (target: string) =>
    state.adminAudit
      .filter((entry) => entry.target === target)
      .slice(0, 30)
      .map(({ id, action, actor, changes, reason, created }) => ({
        id,
        action,
        actor,
        changes,
        ...(reason ? { reason } : {}),
        created,
      }));
  const productDetail = (product: Product): AdminProductDetail => ({
    ...adminProduct(product),
    imageOptions,
    history: history(`product:${product.id}`),
  });
  const audit = (
    actor: Member,
    action: AuditRecord["action"],
    target: string,
    changes: AuditRecord["changes"],
    reason?: string,
  ) => {
    const created = new Date().toISOString();
    state.adminAudit.unshift({
      id: randomUUID(),
      action,
      actor: actor.name,
      actorId: actor.id,
      target,
      changes,
      ...(reason ? { reason } : {}),
      created,
    });
    return created;
  };
  /** Replace instead of mutating so in-memory order snapshots keep their original product. */
  const replaceProduct = (product: Product, changes: Partial<Product>, updated: string) => {
    state.products = state.products.map((item) =>
      item.id === product.id ? { ...product, ...changes } : item,
    );
    state.productVersions[product.id] = { version: versionOf(product.id).version + 1, updated };
    return findProduct(product.id);
  };

  const customerOf = (order: Order) => {
    const account = order.owner.startsWith("member:")
      ? state.accounts[order.owner.slice("member:".length)]
      : undefined;
    return account ? { id: account.id, name: account.name, email: account.email } : null;
  };
  const orderSummary = (order: Order): AdminOrderSummary => {
    const [first, ...rest] = order.items;
    return {
      id: order.id,
      created: order.created,
      customer: customerOf(order),
      recipient: order.recipient,
      title: first
        ? `${first.custom?.name ?? first.product.name}${rest.length ? ` 외 ${rest.length}건` : ""}`
        : "주문 상품 없음",
      itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      total: order.total,
    };
  };
  const orderDetail = (order: Order): AdminOrder => ({
    ...orderSummary(order),
    address: order.address,
    items: order.items.map((item) => ({
      productId: item.product.id,
      name: item.custom?.name ?? item.product.name,
      typeName: item.product.typeName,
      volume: item.product.volume,
      option: item.custom
        ? `맞춤 조향 · ${item.custom.label}`
        : item.selection.length
          ? item.selection
              .map((id) => state.products.find((product) => product.id === id)?.name ?? id)
              .join(", ")
          : null,
      quantity: item.quantity,
      unitPrice: item.unitPrice ?? item.product.price,
    })),
  });

  const statusOf = (inquiry: Inquiry): InquiryStatus => inquiry.status ?? "received";
  const inquirySummary = (inquiry: Inquiry): AdminInquirySummary => ({
    id: inquiry.id,
    brand: inquiry.brand,
    name: inquiry.name,
    type: inquiry.type,
    status: statusOf(inquiry),
    created: inquiry.created,
    updated: inquiry.updated ?? null,
  });
  const inquiryDetail = (inquiry: Inquiry): AdminInquiry => ({
    ...inquirySummary(inquiry),
    email: inquiry.email,
    website: inquiry.website,
    introduction: inquiry.introduction,
    message: inquiry.message,
    memo: inquiry.memo ?? "",
    version: inquiry.version ?? 1,
    history: history(`inquiry:${inquiry.id}`),
  });
  const findInquiry = (id: string) => {
    const inquiry = state.inquiries.find((item) => item.id === id);
    if (!inquiry) {
      throw new HttpError(404, "입점 문의를 찾을 수 없어요.");
    }

    return inquiry;
  };
  const newestInquiries = () =>
    [...state.inquiries].sort((a, b) => b.created.localeCompare(a.created));

  router.use("/admin", (req, res, next) => {
    res.locals.admin = requireAdmin(req, res, database);
    next();
  });

  router.get("/admin/overview", (_req, res) => {
    const since = Date.now() - RECENT_DAYS * 86_400_000;
    const recent = state.orders.filter((order) => Date.parse(order.created) >= since);
    const low = state.products
      .filter((product) => product.stock <= LOW_STOCK)
      .sort((a, b) => a.stock - b.stock);
    const inquiries = Object.fromEntries(inquiryStatuses.map((status) => [status, 0])) as Record<
      InquiryStatus,
      number
    >;
    for (const inquiry of state.inquiries) {
      inquiries[statusOf(inquiry)] += 1;
    }

    res.json({
      products: {
        total: state.products.length,
        lowStock: low.filter((product) => product.stock > 0).length,
        soldOut: low.filter((product) => product.stock === 0).length,
      },
      lowStockProducts: low.slice(0, 5).map(({ id, name, stock }) => ({ id, name, stock })),
      orders: {
        total: state.orders.length,
        recent: recent.length,
        recentRevenue: recent.reduce((sum, order) => sum + order.total, 0),
      },
      recentOrders: state.orders.slice(0, 5).map(orderSummary),
      inquiries,
      recentInquiries: newestInquiries().slice(0, 5).map(inquirySummary),
    });
  });

  router.get("/admin/products", (req, res) => {
    const query = queryText(req, "q").toLowerCase();
    const collection = queryText(req, "collection");
    const stock = queryText(req, "stock");
    const products = state.products.filter(
      (product) =>
        (!collection || product.collection === collection) &&
        (stock !== "low" || product.stock <= LOW_STOCK) &&
        (stock !== "out" || product.stock === 0) &&
        (!query ||
          [product.id, product.name, product.englishName, product.typeName].some((value) =>
            value.toLowerCase().includes(query),
          )),
    );
    res.json(paginate(products.map(adminProduct), adminPageNumber(req.query.page)));
  });
  router.get("/admin/products/:id", (req, res) => {
    res.json(productDetail(findProduct(String(req.params.id))));
  });
  router.patch("/admin/products/:id", requireJsonBody, (req, res) => {
    const product = findProduct(String(req.params.id));
    requireVersion(req.body.version, versionOf(product.id).version);
    const changes: Partial<Product> = {};
    for (const [field, max] of [
      ["name", 100],
      ["englishName", 100],
      ["description", 1000],
    ] as const) {
      if (req.body[field] !== undefined) {
        changes[field] = requireString(req.body[field], "상품 정보를 확인해 주세요.", max);
      }
    }

    if (req.body.price !== undefined) {
      const price = req.body.price;
      if (price !== null && (!Number.isInteger(price) || price < 0 || price > 10_000_000)) {
        throw new HttpError(400, "가격은 0원 이상 1,000만 원 이하의 정수로 입력해 주세요.");
      }

      changes.price = price;
    }

    if (req.body.image !== undefined) {
      if (!imageOptions.includes(req.body.image)) {
        throw new HttpError(400, "등록된 상품 이미지 중에서 선택해 주세요.");
      }

      changes.image = changes.imageUrl = req.body.image;
    }

    for (const field of ["featured", "isNew"] as const) {
      if (req.body[field] !== undefined) {
        if (typeof req.body[field] !== "boolean") {
          throw new HttpError(400, "상품 노출 설정을 확인해 주세요.");
        }

        changes[field] = req.body[field];
      }
    }

    const diff = Object.entries(changes)
      .filter(([field, value]) => field !== "imageUrl" && product[field as keyof Product] !== value)
      .map(([field, to]) => ({ field, from: product[field as keyof Product], to }));
    if (!diff.length) {
      res.json(productDetail(product));
      return;
    }

    const updated = audit(res.locals.admin, "product.update", `product:${product.id}`, diff);
    const next = replaceProduct(product, changes, updated);
    database.persist();
    res.json(productDetail(next));
  });
  router.post("/admin/products/:id/stock-adjustments", requireJsonBody, (req, res) => {
    const product = findProduct(String(req.params.id));
    const { delta, key } = req.body;
    const reason = requireString(req.body.reason, "재고 조정 사유를 입력해 주세요.", 200);
    if (typeof key !== "string" || !/^[A-Za-z0-9-]{8,64}$/.test(key)) {
      throw new HttpError(400, "요청 식별자를 확인해 주세요.");
    }

    const previous = state.stockRequests[key];
    if (previous) {
      if (
        previous.productId !== product.id ||
        previous.delta !== delta ||
        previous.reason !== reason
      ) {
        throw new HttpError(409, "이미 사용한 요청 식별자예요. 새로 시도해 주세요.");
      }

      // A resent request returns the current state without applying the change again.
      res.json(productDetail(product));
      return;
    }

    requireVersion(req.body.version, versionOf(product.id).version);
    if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > MAX_STOCK) {
      throw new HttpError(400, "조정 수량을 0이 아닌 정수로 입력해 주세요.");
    }

    const stock = product.stock + delta;
    if (stock < 0 || stock > MAX_STOCK) {
      throw new HttpError(
        400,
        `조정 후 재고는 0개 이상 ${MAX_STOCK.toLocaleString("ko-KR")}개 이하여야 해요.`,
      );
    }

    const updated = audit(
      res.locals.admin,
      "product.stock",
      `product:${product.id}`,
      [{ field: "stock", from: product.stock, to: stock }],
      reason,
    );
    state.stockRequests[key] = { productId: product.id, delta, reason };
    const next = replaceProduct(product, { stock }, updated);
    database.persist();
    res.status(201).json(productDetail(next));
  });

  router.get("/admin/orders", (req, res) => {
    const from = req.query.from;
    const to = req.query.to;
    if ((from !== undefined && !isDateInput(from)) || (to !== undefined && !isDateInput(to))) {
      throw new HttpError(400, "조회 기간을 확인해 주세요.");
    }

    // Dates are business days in Korea; `to` includes the whole selected day.
    const start = from ? Date.parse(`${from}T00:00:00+09:00`) : -Infinity;
    const end = to ? Date.parse(`${to}T00:00:00+09:00`) + 86_400_000 : Infinity;
    if (start >= end) {
      throw new HttpError(400, "조회 시작일이 종료일보다 늦어요.");
    }

    const orders = state.orders.filter((order) => {
      const created = Date.parse(order.created);
      return created >= start && created < end;
    });
    res.json(paginate(orders.map(orderSummary), adminPageNumber(req.query.page)));
  });
  router.get("/admin/orders/:id", (req, res) => {
    const order = state.orders.find((item) => item.id === req.params.id);
    if (!order) {
      throw new HttpError(404, "주문을 찾을 수 없어요.");
    }

    res.json(orderDetail(order));
  });

  router.get("/admin/inquiries", (req, res) => {
    const status = queryText(req, "status");
    const inquiries = newestInquiries().filter(
      (inquiry) => !status || statusOf(inquiry) === status,
    );
    res.json(paginate(inquiries.map(inquirySummary), adminPageNumber(req.query.page)));
  });
  router.get("/admin/inquiries/:id", (req, res) => {
    res.json(inquiryDetail(findInquiry(String(req.params.id))));
  });
  router.patch("/admin/inquiries/:id", requireJsonBody, (req, res) => {
    const inquiry = findInquiry(String(req.params.id));
    requireVersion(req.body.version, inquiry.version ?? 1);
    const { status, memo } = req.body;
    if (status !== undefined && !inquiryStatuses.includes(status)) {
      throw new HttpError(400, "처리 상태를 확인해 주세요.");
    }

    if (memo !== undefined && (typeof memo !== "string" || memo.length > 2000)) {
      throw new HttpError(400, "내부 메모는 2,000자 이하로 입력해 주세요.");
    }

    const changes = [
      ...(status !== undefined && status !== statusOf(inquiry)
        ? [{ field: "status", from: statusOf(inquiry), to: status }]
        : []),
      ...(memo !== undefined && memo.trim() !== (inquiry.memo ?? "")
        ? [{ field: "memo", from: inquiry.memo ?? "", to: memo.trim() }]
        : []),
    ];
    if (changes.length) {
      const updated = audit(res.locals.admin, "inquiry.update", `inquiry:${inquiry.id}`, changes);
      Object.assign(inquiry, {
        status: status ?? statusOf(inquiry),
        memo: memo === undefined ? (inquiry.memo ?? "") : memo.trim(),
        version: (inquiry.version ?? 1) + 1,
        updated,
      });
      database.persist();
    }

    res.json(inquiryDetail(inquiry));
  });
  return router;
}
