import { adminPageResponse, adminProductResponse } from "@/server/backend/admin";
import { adminQueries } from "@/features/admin/model/admin";
import { createBffHandler } from "@/server/bff/handler";

export const GET = createBffHandler("GET", "/admin/products", {
  authScope: "admin",
  responseBody: adminPageResponse(adminProductResponse),
  query: adminQueries.products,
});
