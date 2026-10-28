import { adminPageResponse, adminInquirySummaryResponse } from "@/server/backend/admin";
import { adminQueries } from "@/features/admin/model/admin";
import { createBffHandler } from "@/server/bff/handler";

export const GET = createBffHandler("GET", "/admin/inquiries", {
  authScope: "admin",
  responseBody: adminPageResponse(adminInquirySummaryResponse),
  query: adminQueries.inquiries,
});
