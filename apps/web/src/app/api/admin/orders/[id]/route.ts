import { createBffHandler } from "@/server/bff/handler";
import { backendSegment } from "@/server/backend/transport";
import { adminOrderResponse } from "@/server/backend/admin";
const resource = (params: Record<string, string>) => "/admin/orders/" + backendSegment(params.id);
export const GET = createBffHandler("GET", resource, {
  authScope: "admin",
  responseBody: adminOrderResponse,
});
