import { createBffHandler } from "@/server/bff/handler";
import { backendSegment } from "@/server/backend/transport";

export const GET = createBffHandler(
  "GET",
  (params) => "/catalog/products/" + backendSegment(params.id),
  { session: false },
);
