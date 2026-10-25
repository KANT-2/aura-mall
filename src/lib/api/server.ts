import "server-only";
import { ApiError } from "./client";

export async function serverRequest<T>(path: string): Promise<T> {
  const base = process.env.API_URL ?? "http://127.0.0.1:4000";
  const response = await fetch(`${base}/api${path}`, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new ApiError(response.status, body?.error?.message ?? "API 요청 실패");
  return body as T;
}
