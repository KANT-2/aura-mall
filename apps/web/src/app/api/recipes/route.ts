import { createBffHandler } from "@/server/bff/handler";

export const GET = createBffHandler("GET", "/recipes");
export const POST = createBffHandler("POST", "/recipes");
