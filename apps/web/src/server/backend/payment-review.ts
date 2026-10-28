import "server-only";
import { boolean, integer, list, nullableText, record, text } from "@/server/backend/decode";
export function paymentReviewResponse(value: unknown) {
  const page = record(value);
  return {
    total: integer(page.total),
    page: integer(page.page),
    pageSize: integer(page.pageSize),
    items: list(page.items, (value) => {
      const row = record(value);
      return {
        id: text(row.id),
        ...(row.isDemo !== undefined ? { isDemo: boolean(row.isDemo) } : {}),
        orderId: text(row.orderId),
        status: text(row.status),
        orderStatus: text(row.orderStatus),
        amount: integer(row.amount),
        unresolved: boolean(row.unresolved),
        reviewReason: nullableText(row.reviewReason),
        failureMessage: nullableText(row.failureMessage),
        updated: text(row.updated),
      };
    }),
  };
}
