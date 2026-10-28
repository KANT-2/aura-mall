import { createBffHandler } from "@/server/bff/handler";
import { orderResponse, ordersResponse } from "@/server/backend/orders";

export const GET = createBffHandler("GET", "/orders", { responseBody: ordersResponse });
export const POST = createBffHandler("POST", "/orders", {
  idempotencyKey: true,
  bodyFields: ["recipient", "recipientPhone", "address", "deliveryNote", "coupon", "items"],
  responseBody: orderResponse,
});
