import { createBffHandler } from "@/server/bff/handler";
import { questionPageResponse } from "@/server/backend/questions";
export const GET = createBffHandler("GET", "/admin/questions", {
  authScope: "admin",
  query: ["page", "unanswered"],
  responseBody: questionPageResponse,
});
