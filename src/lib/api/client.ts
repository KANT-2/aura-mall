import { ApiError } from "@/lib/api/errors";
export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...options,
    headers,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      response.status,
      body?.error?.message ?? "요청을 처리하지 못했어요.",
      body?.error?.code,
    );
  return body as T;
}
