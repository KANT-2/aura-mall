import "server-only";
import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api/errors";
import { backendConfig } from "@/server/backend/config";
import { backendRequest, backendError } from "@/server/backend/transport";
import { requestSessionCookie, responseSessionCookies } from "@/server/bff/session-cookie";
import { jsonRequestBody } from "@/server/bff/request-body";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type Params = Record<string, string>;
type BackendPath = string | ((params: Params) => string);

/** Explicit route files select the upstream path; browser input cannot select a host. */
export function createBffHandler(method: Method, path: BackendPath, { session = true } = {}) {
  return async function handle(request: Request, context?: { params: Promise<Params> }) {
    const requestId = randomUUID();
    const headers = new Headers({
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Request-ID": requestId,
      ...(session ? { Vary: "Cookie" } : {}),
    });
    try {
      const config = backendConfig();
      const origin = config.appOrigin ?? new URL(request.url).origin;
      const mutation = method !== "GET";
      if (request.method !== method && !(method === "GET" && request.method === "HEAD"))
        throw new ApiError(405, "지원하지 않는 요청 방식이에요.", "METHOD_NOT_ALLOWED");
      if (
        mutation &&
        (request.headers.get("sec-fetch-site") === "cross-site" ||
          (request.headers.has("origin") && request.headers.get("origin") !== origin))
      )
        throw new ApiError(403, "허용되지 않은 출처의 요청이에요.", "INVALID_ORIGIN");
      const body = mutation ? await jsonRequestBody(request) : undefined;
      const backendPath = typeof path === "string" ? path : path(await context!.params);
      const response = await backendRequest(backendPath, {
        method,
        body,
        signal: request.signal,
        requestId,
        cookie: session
          ? requestSessionCookie(request.headers.get("cookie"), config.sessionCookie)
          : undefined,
        owner: session ? (request.headers.get("x-session-owner") ?? undefined) : undefined,
      });
      if (session)
        for (const cookie of responseSessionCookies(
          response.cookies,
          config.sessionCookie,
          origin.startsWith("https:"),
        ))
          headers.append("Set-Cookie", cookie);
      if (response.status >= 400) throw backendError(response.status, response.data);
      return response.status === 204
        ? new Response(null, { status: 204, headers })
        : Response.json(response.data, { status: response.status, headers });
    } catch (error) {
      const failure =
        error instanceof ApiError
          ? error
          : new ApiError(500, "요청을 처리하지 못했어요.", "INTERNAL_ERROR");
      return Response.json(
        { error: { code: failure.code, message: failure.message } },
        { status: failure.status, headers },
      );
    }
  };
}
