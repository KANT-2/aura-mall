import { createBffHandler } from "@/server/bff/handler";
import { paymentResponse } from "@/server/backend/payments";
import { backendSegment } from "@/server/backend/transport";

export const GET = createBffHandler("GET", (params) => "/payments/" + backendSegment(params.id), {
  responseBody: paymentResponse,
});
