import { createBffHandler } from "@/server/bff/handler";
export const GET = createBffHandler("GET", "/admin/auth/me", {
  authScope: "admin",
  adminAuthAction: "me",
});
