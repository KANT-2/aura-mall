import { createBffHandler } from "@/server/bff/handler";
import { paymentReviewResponse } from "@/server/backend/payment-review";
export const GET = createBffHandler("GET", "/admin/payments/review", {
  authScope: "admin",
  query: ["page", "status", "reason"],
  responseBody: paymentReviewResponse,
});
