import { createBffHandler } from "@/server/bff/handler";

export const POST = createBffHandler("POST", "/auth/change-password", {
  authAction: "change-password",
});
