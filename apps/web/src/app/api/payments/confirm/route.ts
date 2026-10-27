import { createBffHandler } from "@/server/bff/handler";
import { paymentResponse } from "@/server/backend/payments";

export const POST = createBffHandler("POST", "/payments/confirm", {
  bodyFields: ["paymentKey", "orderId", "amount"],
  responseBody: paymentResponse,
});
