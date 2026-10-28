import { createBffHandler } from "@/server/bff/handler";
import { backendSegment } from "@/server/backend/transport";
import { adminInquiryResponse } from "@/server/backend/admin";
const resource = (params: Record<string, string>) =>
  "/admin/inquiries/" + backendSegment(params.id);
export const GET = createBffHandler("GET", resource, {
  authScope: "admin",
  responseBody: adminInquiryResponse,
});
export const PATCH = createBffHandler("PATCH", resource, {
  authScope: "admin",
  bodyFields: ["version", "status", "memo"],
  responseBody: adminInquiryResponse,
});
