import { createBffHandler } from "@/server/bff/handler";
import { backendSegment } from "@/server/backend/transport";

export const DELETE = createBffHandler(
  "DELETE",
  (params) => "/recipes/" + backendSegment(params.id),
);
