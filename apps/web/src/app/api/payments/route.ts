import { createBffHandler } from "@/server/bff/handler";
import { paymentResponse } from "@/server/backend/payments";

export const POST = createBffHandler("POST", "/payments", {
  bodyFields: ["orderId"],
  responseBody: paymentResponse,
});
