import { createBffHandler } from "@/server/bff/handler";
import { adminAccountResponse } from "@/server/backend/admin";
export const POST = createBffHandler("POST", "/admin/admins", {
  authScope: "admin",
  bodyFields: ["name", "email", "password"],
  responseBody: adminAccountResponse,
});
