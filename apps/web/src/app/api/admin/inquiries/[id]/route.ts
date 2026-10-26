import { createBffHandler } from "@/server/bff/handler";
import { backendSegment } from "@/server/backend/transport";

const inquiry = (params: Record<string, string>) => "/admin/inquiries/" + backendSegment(params.id);
export const GET = createBffHandler("GET", inquiry);
export const PATCH = createBffHandler("PATCH", inquiry);
