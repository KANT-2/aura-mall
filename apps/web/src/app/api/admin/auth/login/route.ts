import { createBffHandler } from "@/server/bff/handler";
export const POST = createBffHandler("POST", "/admin/auth/login", {
  authScope: "admin",
  adminAuthAction: "login",
  bodyFields: ["email", "password"],
});
