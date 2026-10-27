import "server-only";
import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api/errors";
import { isRecord } from "@/lib/validation";
import { backendConfig } from "@/server/backend/config";

export type BackendResult = { status: number; data: unknown; cookies: string[]; requestId: string };
type BackendOptions = {
  method?: string;
  body?: string;
  /** Supplied by the BFF cookie adapter, never copied from browser Authorization. */
  token?: string;
  owner?: string;
  guestId?: string;
  idempotencyKey?: string;
  /** Already filtered by the route's allow-list; never a raw browser query string. */
  query?: URLSearchParams;
  signal?: AbortSignal;
  requestId?: string;
};

export function backendSegment(value: string) {
  if (!value || value === "." || value === ".." || /[\/\\?#\u0000-\u001f\u007f]/.test(value)) {
    throw new ApiError(400, "요청 경로를 확인해 주세요.", "INVALID_PATH");
  }

  return encodeURIComponent(value);
}

export function backendError(status: number, data: unknown) {
  let message = "요청을 처리하지 못했어요.";
  let code = `HTTP_${status}`;
  if (status === 422) {
    message = "입력 항목을 확인해 주세요.";
  } else if (isRecord(data)) {
    if (isRecord(data.error) && typeof data.error.message === "string") {
      message = data.error.message;
      if (typeof data.error.code === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(data.error.code)) {
        code = data.error.code;
      }
    } else if (typeof data.detail === "string") {
      message = data.detail;
    } else if (isRecord(data.detail) && typeof data.detail.message === "string") {
      message = data.detail.message;
    }
  }

  // FastAPI validation details can contain submitted passwords and other private input.
  return new ApiError(status, message, status === 422 ? "VALIDATION_ERROR" : code);
}

/** Both RSC and BFF use this transport; RSC never calls the public Next API over HTTP. */
export async function backendRequest(
  path: string,
  options: BackendOptions = {},
): Promise<BackendResult> {
  const config = backendConfig();
  if (
    !path.startsWith("/") ||
    /[\\?#]/.test(path) ||
    path.split("/").some((part) => part === "." || part === "..")
  ) {
    throw new ApiError(500, "API 요청 경로를 확인해 주세요.", "INVALID_BACKEND_PATH");
  }

  const requestId = options.requestId ?? randomUUID();
  const timeout = AbortSignal.timeout(config.timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  try {
    const headers = new Headers({ Accept: "application/json", "X-Request-ID": requestId });
    if (config.bffSharedKey && !["GET", "HEAD", "OPTIONS"].includes(options.method ?? "GET")) {
      headers.set("X-Aura-BFF-Key", config.bffSharedKey);
    }

    if (options.body !== undefined) {
      headers.set("Content-Type", "application/json");
    }

    if (options.token) {
      headers.set("Authorization", `Bearer ${options.token}`);
    }

    if (options.owner) {
      headers.set("X-Account-Owner", options.owner);
    }

    if (options.guestId) {
      headers.set("X-Guest-ID", options.guestId);
    }

    if (options.idempotencyKey) {
      headers.set("Idempotency-Key", options.idempotencyKey);
    }

    const search = options.query?.size ? `?${options.query}` : "";
    const response = await fetch(`${config.apiUrl}${path}${search}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body,
      cache: "no-store",
      redirect: "manual",
      signal,
    });
    if (response.status >= 500 || (response.status >= 300 && response.status < 400)) {
      await response.body?.cancel();
      throw new ApiError(502, "API 서버에 연결하지 못했어요.", "BACKEND_UNAVAILABLE");
    }

    let data: unknown = null;
    if (response.status !== 204) {
      if (
        !/\bapplication\/(?:[\w.-]+\+)?json\b/i.test(response.headers.get("content-type") ?? "")
      ) {
        await response.body?.cancel();
        throw new ApiError(502, "API 서버의 응답을 확인하지 못했어요.", "INVALID_BACKEND_RESPONSE");
      }

      try {
        data = await response.json();
      } catch (error) {
        if (signal.aborted) {
          throw error;
        }

        throw new ApiError(502, "API 서버의 응답을 확인하지 못했어요.", "INVALID_BACKEND_RESPONSE");
      }
    }

    return { status: response.status, data, cookies: response.headers.getSetCookie(), requestId };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (timeout.aborted) {
      throw new ApiError(504, "API 응답이 지연되고 있어요. 다시 시도해 주세요.", "BACKEND_TIMEOUT");
    }

    if (options.signal?.aborted) {
      throw new ApiError(499, "요청이 취소되었어요.", "REQUEST_CANCELLED");
    }

    throw new ApiError(502, "API 서버에 연결하지 못했어요.", "BACKEND_UNAVAILABLE");
  }
}
