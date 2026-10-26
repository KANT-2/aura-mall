import { createBffHandler } from "@/server/bff/handler";
import { backendSegment } from "@/server/backend/transport";

export const PATCH = createBffHandler(
  "PATCH",
  (params) => "/cart/items/" + backendSegment(params.key),
);
