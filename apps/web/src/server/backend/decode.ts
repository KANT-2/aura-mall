import "server-only";
import { ApiError } from "@/lib/api/errors";
import { isRecord } from "@/lib/validation";

export function invalidResponse(): never {
  throw new ApiError(502, "API 서버의 응답을 확인하지 못했어요.", "INVALID_BACKEND_RESPONSE");
}
export const record = (value: unknown) => (isRecord(value) ? value : invalidResponse());
export const text = (value: unknown) => (typeof value === "string" ? value : invalidResponse());
export const integer = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) ? value : invalidResponse();
export const boolean = (value: unknown) => (typeof value === "boolean" ? value : invalidResponse());
export const nullableText = (value: unknown) => (value === null ? null : text(value));
export const nullableInteger = (value: unknown) => (value === null ? null : integer(value));
export const list = <T>(value: unknown, decode: (item: unknown) => T): T[] =>
  Array.isArray(value) ? value.map(decode) : invalidResponse();
