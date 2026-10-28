import { createBffHandler } from "@/server/bff/handler";
import { questionPageResponse } from "@/server/backend/questions";
export const GET = createBffHandler("GET", "/questions/mine", {
  query: ["page"],
  responseBody: questionPageResponse,
});
