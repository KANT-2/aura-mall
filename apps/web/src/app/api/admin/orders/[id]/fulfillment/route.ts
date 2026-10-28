import { createBffHandler } from "@/server/bff/handler";
import { backendSegment } from "@/server/backend/transport";
import { adminOrderResponse } from "@/server/backend/admin";
export const PATCH = createBffHandler(
  "PATCH",
  (params) => `/admin/orders/${backendSegment(params.id)}/fulfillment`,
  {
    authScope: "admin",
    bodyFields: ["expectedStatus", "status", "reason", "courier", "trackingNumber"],
    responseBody: adminOrderResponse,
  },
);
