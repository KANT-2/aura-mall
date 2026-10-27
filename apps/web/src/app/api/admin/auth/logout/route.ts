import { createBffHandler } from "@/server/bff/handler";
export const POST = createBffHandler("POST", "/admin/auth/logout", {
  authScope: "admin",
  adminAuthAction: "logout",
});
