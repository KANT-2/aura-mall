import { adminQueries } from "@/features/admin/model/admin";
import { createBffHandler } from "@/server/bff/handler";

export const GET = createBffHandler("GET", "/admin/products", { query: adminQueries.products });
