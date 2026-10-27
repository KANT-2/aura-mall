import { createBffHandler } from "@/server/bff/handler";
export const GET = createBffHandler("GET", "/auth/me", { authAction: "me" });
