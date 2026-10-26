import { adminQueries } from "@/features/admin/model/admin";
import { createBffHandler } from "@/server/bff/handler";

export const GET = createBffHandler("GET", "/admin/inquiries", { query: adminQueries.inquiries });
