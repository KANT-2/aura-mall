import { createBffHandler } from "@/server/bff/handler";
import { backendSegment } from "@/server/backend/transport";

export const GET = createBffHandler(
  "GET",
  (params) => "/admin/orders/" + backendSegment(params.id),
);
