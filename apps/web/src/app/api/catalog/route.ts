import { createBffHandler } from "@/server/bff/handler";
import { catalogResponse } from "@/server/backend/storefront";

export const GET = createBffHandler("GET", "/catalog", {
  session: false,
  responseBody: catalogResponse,
});
