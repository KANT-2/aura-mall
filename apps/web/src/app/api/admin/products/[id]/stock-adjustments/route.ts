import { createBffHandler } from "@/server/bff/handler";
import { backendSegment } from "@/server/backend/transport";

export const POST = createBffHandler(
  "POST",
  (params) => "/admin/products/" + backendSegment(params.id) + "/stock-adjustments",
);
