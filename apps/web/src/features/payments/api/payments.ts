import { request } from "@/lib/api/client";
import type { Payment, PaymentConfirmation } from "@/features/payments/model/payment";

export const startPayment = (orderId: string) =>
  request<Payment>("/payments", { method: "POST", body: JSON.stringify({ orderId }) });

export const confirmPayment = (confirmation: PaymentConfirmation) =>
  request<Payment>("/payments/confirm", { method: "POST", body: JSON.stringify(confirmation) });

export const getPayment = (id: string, signal?: AbortSignal) =>
  request<Payment>(`/payments/${encodeURIComponent(id)}`, { signal });
