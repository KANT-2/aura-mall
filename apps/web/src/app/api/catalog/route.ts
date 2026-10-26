import { createBffHandler } from "@/server/bff/handler";

export const GET = createBffHandler("GET", "/catalog", { session: false });
