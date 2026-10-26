import { adminQueries } from "@/features/admin/model/admin";
import { createBffHandler } from "@/server/bff/handler";

export const GET = createBffHandler("GET", "/admin/orders", { query: adminQueries.orders });
