import { createBffHandler } from "@/server/bff/handler";
import { catalogResponse } from "@/server/backend/storefront";

export const GET = createBffHandler("GET", "/catalog", {
  authenticated: false,
  responseBody: catalogResponse,
});
