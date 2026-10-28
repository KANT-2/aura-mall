import type { CartItem } from "@/features/cart/model/cart";
export const orderStatuses = [
  "received",
  "paid",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
] as const;
export type OrderStatus = (typeof orderStatuses)[number];
export const orderStatusLabels: Record<OrderStatus, string> = {
  received: "결제 대기",
  paid: "결제 완료",
  preparing: "상품 준비 중",
  shipped: "배송 중",
  delivered: "배송 완료",
  cancelled: "취소 완료",
};
export type Order = {
  id: string;
  items: CartItem[];
  total: number;
  recipient: string;
  address: string;
  created: string;
  status?: OrderStatus;
  recipientPhone?: string;
  deliveryNote?: string;
  courier?: string;
  trackingNumber?: string;
};
