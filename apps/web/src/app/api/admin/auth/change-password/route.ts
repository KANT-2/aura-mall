import { createBffHandler } from "@/server/bff/handler";
export const POST = createBffHandler("POST", "/admin/auth/change-password", {
  authScope: "admin",
  bodyFields: ["currentPassword", "newPassword"],
});
