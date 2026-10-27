import { createBffHandler } from "@/server/bff/handler";
export const POST = createBffHandler("POST", "/auth/login", {
  authAction: "login",
  bodyFields: ["email", "password"],
});
