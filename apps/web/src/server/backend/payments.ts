import "server-only";
import {
  paymentStatuses,
  type Payment,
  type PaymentStatus,
} from "@/features/payments/model/payment";
import { integer, invalidResponse, nullableText, record, text } from "@/server/backend/decode";

function status(value: unknown): PaymentStatus {
  return paymentStatuses.includes(value as PaymentStatus)
    ? (value as PaymentStatus)
    : invalidResponse();
}

export function paymentResponse(value: unknown): Payment {
  const item = record(value);
  return {
    id: text(item.id),
    orderId: text(item.orderId),
    pgOrderId: text(item.pgOrderId),
    orderName: text(item.orderName),
    amount: integer(item.amount),
    status: status(item.status),
    method: nullableText(item.method),
    approved: nullableText(item.approved),
    failureCode: nullableText(item.failureCode),
    failureMessage: nullableText(item.failureMessage),
  };
}
