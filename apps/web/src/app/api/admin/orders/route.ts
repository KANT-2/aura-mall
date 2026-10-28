import { adminPageResponse, adminOrderSummaryResponse } from "@/server/backend/admin";
import { adminQueries } from "@/features/admin/model/admin";
import { createBffHandler } from "@/server/bff/handler";

export const GET = createBffHandler("GET", "/admin/orders", {
  authScope: "admin",
  responseBody: adminPageResponse(adminOrderSummaryResponse),
  query: adminQueries.orders,
});
