import { createBffHandler } from "@/server/bff/handler";
import { backendSegment } from "@/server/backend/transport";
import { questionResponse } from "@/server/backend/questions";
export const PATCH = createBffHandler(
  "PATCH",
  (params) => `/admin/questions/${backendSegment(params.id)}/answer`,
  { authScope: "admin", bodyFields: ["answer", "version"], responseBody: questionResponse },
);
