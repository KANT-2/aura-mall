import { createBffHandler } from "@/server/bff/handler";

export const GET = createBffHandler("GET", "/session", { sessionResponse: true });
