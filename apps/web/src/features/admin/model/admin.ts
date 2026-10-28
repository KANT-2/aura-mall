import type { OrderStatus } from "@/features/checkout/model/order";
import type { Product } from "@/features/catalog/model/catalog";

/** Admin DTOs are separate from consumer DTOs; never reuse them in public catalog or account APIs. */
export type AdminAccount = { id: string; name: string; email: string };
export type AdminAccountState = { admin: AdminAccount | null };

export const ADMIN_PAGE_SIZE = 20;
export const LOW_STOCK = 5;
export const MAX_STOCK = 99_999;
export type AdminPage<T> = { items: T[]; total: number; page: number; pageSize: number };

export type AdminProduct = Pick<
  Product,
  | "id"
  | "collection"
  | "type"
  | "typeName"
  | "name"
  | "englishName"
  | "volume"
  | "price"
  | "stock"
  | "image"
  | "description"
  | "featured"
  | "isNew"
> & { version: number; updated: string | null };
export type AdminHistoryEntry = {
  id: string;
  action: "product.update" | "product.stock" | "inquiry.update";
  actor: string;
  changes: { field: string; from: unknown; to: unknown }[];
  reason?: string;
  created: string;
};
export type AdminProductDetail = AdminProduct & {
  imageOptions: string[];
  history: AdminHistoryEntry[];
};
export type ProductUpdate = Partial<
  Pick<
    AdminProduct,
    "name" | "englishName" | "description" | "price" | "image" | "featured" | "isNew"
  >
> & { version: number };
/** `key` lets the server ignore a resent adjustment instead of applying it twice. */
export type StockAdjustmentInput = { version: number; delta: number; reason: string; key: string };

export type AdminCustomer = { id: string; name: string; email: string };
export type AdminOrderSummary = {
  status?: OrderStatus;
  isDemo?: boolean;
  id: string;
  created: string;
  customer: AdminCustomer | null;
  recipient: string;
  title: string;
  itemCount: number;
  total: number;
};
export type AdminOrderItem = {
  productId: string;
  name: string;
  typeName: string;
  volume: string;
  option: string | null;
  quantity: number;
  unitPrice: number | null;
};
export type AdminOrder = AdminOrderSummary & {
  address: string;
  items: AdminOrderItem[];
  recipientPhone?: string;
  deliveryNote?: string;
  courier?: string;
  trackingNumber?: string;
  statusHistory?: {
    fromStatus: string | null;
    status: string;
    actorType: string;
    reason: string | null;
    changed: string;
  }[];
};

export const inquiryStatuses = ["received", "reviewing", "done"] as const;
export type InquiryStatus = (typeof inquiryStatuses)[number];
export const inquiryStatusLabels: Record<InquiryStatus, string> = {
  received: "접수",
  reviewing: "검토 중",
  done: "처리 완료",
};
export type AdminInquirySummary = {
  id: string;
  brand: string;
  name: string;
  type: string;
  status: InquiryStatus;
  created: string;
  updated: string | null;
};
export type AdminInquiry = AdminInquirySummary & {
  email: string;
  website: string;
  introduction: string;
  message: string;
  memo: string;
  version: number;
  history: AdminHistoryEntry[];
};
export type InquiryUpdate = { version: number; status?: InquiryStatus; memo?: string };

export type AdminOverview = {
  products: { total: number; lowStock: number; soldOut: number };
  lowStockProducts: Pick<AdminProduct, "id" | "name" | "stock">[];
  orders: { total: number; recent: number; recentRevenue: number };
  recentOrders: AdminOrderSummary[];
  inquiries: Record<InquiryStatus, number>;
  recentInquiries: AdminInquirySummary[];
};

/** Query names each admin list accepts; the BFF forwards only these. */
export const adminQueries = {
  products: ["q", "collection", "stock", "page"],
  orders: ["from", "to", "page"],
  inquiries: ["status", "page"],
} as const;
export type AdminQuery = Record<string, string | undefined>;

export function adminPageNumber(value: unknown) {
  const page = Number(value ?? 1);
  return Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1;
}

export const isDateInput = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00+09:00`));

export function adminSearch(query: AdminQuery) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      search.set(key, value);
    }
  }

  const text = search.toString();
  return text ? `?${text}` : "";
}

export function readAdminQuery(
  params: Record<string, string | string[] | undefined>,
  names: readonly string[],
): AdminQuery {
  return Object.fromEntries(
    names.flatMap((name) => {
      const value = params[name];
      const first = typeof value === "string" ? value : value?.[0];
      return first ? [[name, first]] : [];
    }),
  );
}
