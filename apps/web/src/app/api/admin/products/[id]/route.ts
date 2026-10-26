import { createBffHandler } from "@/server/bff/handler";
import { backendSegment } from "@/server/backend/transport";

const product = (params: Record<string, string>) => "/admin/products/" + backendSegment(params.id);
export const GET = createBffHandler("GET", product);
export const PATCH = createBffHandler("PATCH", product);
