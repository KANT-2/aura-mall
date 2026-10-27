import "server-only";
import type {
  AdminAccount,
  AdminHistoryEntry,
  AdminInquiry,
  AdminInquirySummary,
  AdminOrder,
  AdminOrderSummary,
  AdminOverview,
  AdminPage,
  AdminProduct,
  AdminProductDetail,
  InquiryStatus,
} from "@/features/admin/model/admin";
import {
  boolean,
  integer,
  invalidResponse,
  list,
  nullableInteger,
  nullableText,
  record,
  text,
} from "@/server/backend/decode";

export function adminAccountResponse(value: unknown): AdminAccount {
  const item = record(value);
  return { id: text(item.id), name: text(item.name), email: text(item.email) };
}
export function adminPageResponse<T>(decode: (value: unknown) => T) {
  return (value: unknown): AdminPage<T> => {
    const item = record(value);
    const total = integer(item.total),
      page = integer(item.page),
      pageSize = integer(item.pageSize);
    if (total < 0 || page < 1 || pageSize !== 20) {
      return invalidResponse();
    }

    return { items: list(item.items, decode), total, page, pageSize };
  };
}
export function adminProductResponse(value: unknown): AdminProduct {
  const item = record(value);
  return {
    id: text(item.id),
    collection: text(item.collection),
    type: text(item.type),
    typeName: text(item.typeName),
    name: text(item.name),
    englishName: text(item.englishName),
    volume: text(item.volume),
    price: nullableInteger(item.price),
    stock: integer(item.stock),
    image: text(item.image),
    description: text(item.description),
    featured: boolean(item.featured),
    isNew: boolean(item.isNew),
    version: integer(item.version),
    updated: nullableText(item.updated),
  };
}
function historyResponse(value: unknown): AdminHistoryEntry {
  const item = record(value);
  const action = item.action;
  if (action !== "product.update" && action !== "product.stock" && action !== "inquiry.update") {
    return invalidResponse();
  }

  return {
    id: text(item.id),
    action,
    actor: text(item.actor),
    changes: list(item.changes, (value) => {
      const change = record(value);
      if (!("from" in change) || !("to" in change)) {
        return invalidResponse();
      }

      return { field: text(change.field), from: change.from, to: change.to };
    }),
    ...(item.reason !== undefined ? { reason: text(item.reason) } : {}),
    created: text(item.created),
  };
}
export function adminProductDetailResponse(value: unknown): AdminProductDetail {
  const item = record(value);
  return {
    ...adminProductResponse(item),
    imageOptions: list(item.imageOptions, text),
    history: list(item.history, historyResponse),
  };
}
export function adminOrderSummaryResponse(value: unknown): AdminOrderSummary {
  const item = record(value);
  return {
    id: text(item.id),
    created: text(item.created),
    customer: item.customer === null ? null : adminAccountResponse(item.customer),
    recipient: text(item.recipient),
    title: text(item.title),
    itemCount: integer(item.itemCount),
    total: integer(item.total),
  };
}
export function adminOrderResponse(value: unknown): AdminOrder {
  const item = record(value);
  return {
    ...adminOrderSummaryResponse(item),
    address: text(item.address),
    items: list(item.items, (value) => {
      const line = record(value);
      return {
        productId: text(line.productId),
        name: text(line.name),
        typeName: text(line.typeName),
        volume: text(line.volume),
        option: nullableText(line.option),
        quantity: integer(line.quantity),
        unitPrice: nullableInteger(line.unitPrice),
      };
    }),
  };
}
function statusResponse(value: unknown): InquiryStatus {
  return value === "received" || value === "reviewing" || value === "done"
    ? value
    : invalidResponse();
}
export function adminInquirySummaryResponse(value: unknown): AdminInquirySummary {
  const item = record(value);
  return {
    id: text(item.id),
    brand: text(item.brand),
    name: text(item.name),
    type: text(item.type),
    status: statusResponse(item.status),
    created: text(item.created),
    updated: nullableText(item.updated),
  };
}
export function adminInquiryResponse(value: unknown): AdminInquiry {
  const item = record(value);
  return {
    ...adminInquirySummaryResponse(item),
    email: text(item.email),
    website: text(item.website),
    introduction: text(item.introduction),
    message: text(item.message),
    memo: text(item.memo),
    version: integer(item.version),
    history: list(item.history, historyResponse),
  };
}
export function adminOverviewResponse(value: unknown): AdminOverview {
  const item = record(value),
    products = record(item.products),
    orders = record(item.orders),
    inquiries = record(item.inquiries);
  return {
    products: {
      total: integer(products.total),
      lowStock: integer(products.lowStock),
      soldOut: integer(products.soldOut),
    },
    orders: {
      total: integer(orders.total),
      recent: integer(orders.recent),
      recentRevenue: integer(orders.recentRevenue),
    },
    inquiries: {
      received: integer(inquiries.received),
      reviewing: integer(inquiries.reviewing),
      done: integer(inquiries.done),
    },
    lowStockProducts: list(item.lowStockProducts, (value) => {
      const product = record(value);
      return { id: text(product.id), name: text(product.name), stock: integer(product.stock) };
    }),
    recentOrders: list(item.recentOrders, adminOrderSummaryResponse),
    recentInquiries: list(item.recentInquiries, adminInquirySummaryResponse),
  };
}
