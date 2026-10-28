import { createBffHandler } from "@/server/bff/handler";
import { backendSegment } from "@/server/backend/transport";
import { questionResponse, questionPageResponse } from "@/server/backend/questions";
const resource = (params: Record<string, string>) =>
  `/products/${backendSegment(params.id)}/questions`;
export const GET = createBffHandler("GET", resource, {
  query: ["page"],
  responseBody: questionPageResponse,
});
export const POST = createBffHandler("POST", resource, {
  bodyFields: ["title", "content", "private"],
  responseBody: questionResponse,
});
