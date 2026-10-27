import { createBffHandler } from "@/server/bff/handler";
import { inquiryResponse } from "@/server/backend/storefront";

export const POST = createBffHandler("POST", "/partner", {
  session: false,
  bodyFields: ["brand", "name", "email", "introduction", "message", "type", "consent", "website"],
  responseBody: inquiryResponse,
});
