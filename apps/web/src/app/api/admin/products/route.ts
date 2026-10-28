import {
  adminPageResponse,
  adminProductResponse,
  adminProductDetailResponse,
} from "@/server/backend/admin";
import { adminQueries } from "@/features/admin/model/admin";
import { createBffHandler } from "@/server/bff/handler";

export const GET = createBffHandler("GET", "/admin/products", {
  authScope: "admin",
  responseBody: adminPageResponse(adminProductResponse),
  query: adminQueries.products,
});

export const POST = createBffHandler("POST", "/admin/products", {
  authScope: "admin",
  maxBodyBytes: 192 * 1024,
  bodyFields: [
    "id",
    "collection",
    "type",
    "name",
    "englishName",
    "volume",
    "category",
    "description",
    "price",
    "stock",
    "image",
    "notes",
    "details",
    "featured",
    "isNew",
    "isActive",
  ],
  responseBody: adminProductDetailResponse,
});
