import { request } from "@/lib/api/client";
import {
  adminSearch,
  type AdminInquiry,
  type AdminInquirySummary,
  type AdminOrder,
  type AdminOrderSummary,
  type AdminOverview,
  type AdminPage,
  type AdminProduct,
  type AdminProductDetail,
  type AdminQuery,
  type InquiryUpdate,
  type ProductUpdate,
  type StockAdjustmentInput,
} from "@/features/admin/model/admin";

export const adminKeys = {
  all: ["admin"] as const,
  overview: ["admin", "overview"] as const,
  products: (query: AdminQuery) => ["admin", "products", query] as const,
  product: (id: string) => ["admin", "product", id] as const,
  orders: (query: AdminQuery) => ["admin", "orders", query] as const,
  order: (id: string) => ["admin", "order", id] as const,
  inquiries: (query: AdminQuery) => ["admin", "inquiries", query] as const,
  inquiry: (id: string) => ["admin", "inquiry", id] as const,
};
const path = (id: string) => encodeURIComponent(id);
const patch = (body: unknown) => ({ method: "PATCH", body: JSON.stringify(body) });

export const getOverview = (signal?: AbortSignal) =>
  request<AdminOverview>("/admin/overview", { signal });
export const getProducts = (query: AdminQuery, signal?: AbortSignal) =>
  request<AdminPage<AdminProduct>>("/admin/products" + adminSearch(query), { signal });
export const getProduct = (id: string, signal?: AbortSignal) =>
  request<AdminProductDetail>(`/admin/products/${path(id)}`, { signal });
export const updateProduct = (id: string, input: ProductUpdate) =>
  request<AdminProductDetail>(`/admin/products/${path(id)}`, patch(input));
export const adjustStock = (id: string, input: StockAdjustmentInput) =>
  request<AdminProductDetail>(`/admin/products/${path(id)}/stock-adjustments`, {
    method: "POST",
    body: JSON.stringify(input),
  });
export const getOrders = (query: AdminQuery, signal?: AbortSignal) =>
  request<AdminPage<AdminOrderSummary>>("/admin/orders" + adminSearch(query), { signal });
export const getOrder = (id: string, signal?: AbortSignal) =>
  request<AdminOrder>(`/admin/orders/${path(id)}`, { signal });
export const getInquiries = (query: AdminQuery, signal?: AbortSignal) =>
  request<AdminPage<AdminInquirySummary>>("/admin/inquiries" + adminSearch(query), { signal });
export const getInquiry = (id: string, signal?: AbortSignal) =>
  request<AdminInquiry>(`/admin/inquiries/${path(id)}`, { signal });
export const updateInquiry = (id: string, input: InquiryUpdate) =>
  request<AdminInquiry>(`/admin/inquiries/${path(id)}`, patch(input));
