import { createBffHandler } from "@/server/bff/handler";
import { backendSegment } from "@/server/backend/transport";
import { orderResponse } from "@/server/backend/orders";
export const POST = createBffHandler(
  "POST",
  (params) => `/orders/${backendSegment(params.id)}/cancel`,
  { responseBody: orderResponse },
);
