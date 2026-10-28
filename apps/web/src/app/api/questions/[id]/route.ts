import { createBffHandler } from "@/server/bff/handler";
import { backendSegment } from "@/server/backend/transport";
import { questionResponse } from "@/server/backend/questions";
const resource = (params: Record<string, string>) => `/questions/${backendSegment(params.id)}`;
export const PATCH = createBffHandler("PATCH", resource, {
  bodyFields: ["title", "content", "private", "version"],
  responseBody: questionResponse,
});
export const DELETE = createBffHandler("DELETE", resource, { query: ["version"] });
