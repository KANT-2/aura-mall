import { createBffHandler } from "@/server/bff/handler";

export const POST = createBffHandler("POST", "/partner", { session: false });
