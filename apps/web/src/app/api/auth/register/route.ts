import { createBffHandler } from "@/server/bff/handler";
export const POST = createBffHandler("POST", "/auth/register", {
  authAction: "register",
  bodyFields: ["email", "password", "name", "marketing"],
});
