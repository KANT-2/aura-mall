import { createBffHandler } from "@/server/bff/handler";

export const GET = createBffHandler("GET", "/orders");
export const POST = createBffHandler("POST", "/orders");
