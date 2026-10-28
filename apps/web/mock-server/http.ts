import type { RequestHandler } from "express";
import { isRecord } from "@/lib/validation";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const requireJsonBody: RequestHandler = (request, _response, next) => {
  if (!request.get("Transfer-Encoding") && Number(request.get("Content-Length") ?? 0) === 0) {
    throw new HttpError(400, "입력 형식을 확인해 주세요.");
  }

  if (!request.is("application/json")) {
    throw new HttpError(415, "JSON 형식으로 요청해 주세요.");
  }

  if (!isRecord(request.body)) {
    throw new HttpError(400, "입력 형식을 확인해 주세요.");
  }

  next();
};
export function requireString(value: unknown, message: string, max = 3000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new HttpError(400, message);
  }

  return value.trim();
}
