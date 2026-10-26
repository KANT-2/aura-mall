import { createBffHandler } from "@/server/bff/handler";
import { recipesResponse } from "@/server/backend/storefront";
import { backendSegment } from "@/server/backend/transport";

export const DELETE = createBffHandler(
  "DELETE",
  (params) => "/recipes/" + backendSegment(params.id),
  { responseBody: recipesResponse },
);
