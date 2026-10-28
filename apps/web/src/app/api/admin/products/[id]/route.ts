import { createBffHandler } from "@/server/bff/handler";
import { backendSegment } from "@/server/backend/transport";
import { adminProductDetailResponse } from "@/server/backend/admin";
const resource = (params: Record<string, string>) => "/admin/products/" + backendSegment(params.id);
export const GET = createBffHandler("GET", resource, {
  authScope: "admin",
  responseBody: adminProductDetailResponse,
});
export const PATCH = createBffHandler("PATCH", resource, {
  authScope: "admin",
  maxBodyBytes: 192 * 1024,
  bodyFields: [
    "isActive",
    "details",
    "notes",
    "category",
    "volume",
    "version",
    "name",
    "englishName",
    "description",
    "price",
    "image",
    "featured",
    "isNew",
  ],
  responseBody: adminProductDetailResponse,
});
