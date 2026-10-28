import { createBffHandler } from "@/server/bff/handler";
import { backendSegment } from "@/server/backend/transport";
import { adminProductDetailResponse } from "@/server/backend/admin";
export const POST = createBffHandler(
  "POST",
  (params) => "/admin/products/" + backendSegment(params.id) + "/stock-adjustments",
  {
    authScope: "admin",
    bodyFields: ["version", "delta", "reason", "key"],
    responseBody: adminProductDetailResponse,
  },
);
