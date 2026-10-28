import { adminOverviewResponse } from "@/server/backend/admin";
import { createBffHandler } from "@/server/bff/handler";

export const GET = createBffHandler("GET", "/admin/overview", {
  authScope: "admin",
  responseBody: adminOverviewResponse,
});
