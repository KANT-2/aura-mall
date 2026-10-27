import { createBffHandler } from "@/server/bff/handler";
import { productResponse } from "@/server/backend/storefront";
import { backendSegment } from "@/server/backend/transport";

export const GET = createBffHandler(
  "GET",
  (params) => "/catalog/products/" + backendSegment(params.id),
  { authenticated: false, responseBody: productResponse },
);
