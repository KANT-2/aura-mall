import { createBffHandler } from "@/server/bff/handler";

export const GET = createBffHandler("GET", "/atelier/draft");
export const PUT = createBffHandler("PUT", "/atelier/draft");
export const DELETE = createBffHandler("DELETE", "/atelier/draft");
