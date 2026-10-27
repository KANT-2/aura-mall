import { createBffHandler } from "@/server/bff/handler";
import { draftResponse } from "@/server/backend/drafts";

export const GET = createBffHandler("GET", "/atelier/draft", { responseBody: draftResponse });
export const PUT = createBffHandler("PUT", "/atelier/draft", {
  bodyFields: ["counts", "name", "label", "step"],
  responseBody: draftResponse,
});
export const DELETE = createBffHandler("DELETE", "/atelier/draft", { responseBody: draftResponse });
