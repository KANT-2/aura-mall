import { createBffHandler } from "@/server/bff/handler";
export const GET = createBffHandler("GET", "/auth/me", { authAction: "me" });
export const PATCH = createBffHandler("PATCH", "/auth/me", { authAction: "update-profile" });
export const DELETE = createBffHandler("DELETE", "/auth/me", { authAction: "deactivate" });
