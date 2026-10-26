import { createBffHandler } from "@/server/bff/handler";

export const POST = createBffHandler("POST", "/auth/logout");
