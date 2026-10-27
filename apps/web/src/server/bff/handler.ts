import "server-only";
import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api/errors";
import { backendConfig } from "@/server/backend/config";
import { backendRequest, backendError } from "@/server/backend/transport";
import { requestJwt, visitorId } from "@/server/bff/token-cookie";
import { clearTokens, handleAuth, type AuthAction } from "@/server/bff/auth";
import { jsonRequestBody } from "@/server/bff/request-body";
import { requestOrigin } from "@/server/bff/request-origin";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type Params = Record<string, string>;
type BackendPath = string | ((params: Params) => string);
type RouteContext = { params: Promise<Params> };
type HandlerOptions = {
  authenticated?: boolean;
  query?: readonly string[];
  authAction?: AuthAction;
  bodyFields?: readonly string[];
  responseBody?: (data: unknown) => unknown;
};

/** Forward only allow-listed, single-valued query parameters. */
export function allowedQuery(url: string, names: readonly string[] = []) {
  const source = new URL(url).searchParams;
  const query = new URLSearchParams();
  for (const name of names) {
    const value = source.get(name)?.trim();
    if (value && value.length <= 100 && !/[\u0000-\u001f\u007f]/.test(value)) {
      query.set(name, value);
    }
  }

  return query;
}

/** Explicit route files select the upstream path; browser input cannot select a host. */
export function createBffHandler(
  method: Method,
  path: string,
  options?: HandlerOptions,
): (request: Request) => Promise<Response>;
export function createBffHandler(
  method: Method,
  path: (params: Params) => string,
  options?: HandlerOptions,
): (request: Request, context: RouteContext) => Promise<Response>;
export function createBffHandler(
  method: Method,
  path: BackendPath,
  { authenticated = true, query, authAction, bodyFields, responseBody }: HandlerOptions = {},
) {
  return async function handle(request: Request, context?: RouteContext) {
    const requestId = randomUUID();
    const headers = new Headers({
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Request-ID": requestId,
      ...(authenticated || authAction ? { Vary: "Cookie" } : {}),
    });
    let secure: boolean | undefined;
    try {
      const config = backendConfig();
      const origin = requestOrigin(request, config.appOrigin);
      secure = origin.startsWith("https:");

      const mutation = method !== "GET";
      if (request.method !== method && !(method === "GET" && request.method === "HEAD")) {
        throw new ApiError(405, "지원하지 않는 요청 방식이에요.", "METHOD_NOT_ALLOWED");
      }

      if (
        mutation &&
        (request.headers.get("sec-fetch-site") === "cross-site" ||
          (request.headers.has("origin") && request.headers.get("origin") !== origin))
      ) {
        throw new ApiError(403, "허용되지 않은 출처의 요청이에요.", "INVALID_ORIGIN");
      }

      let body = mutation ? await jsonRequestBody(request) : undefined;
      if (body !== undefined && bodyFields) {
        const input = JSON.parse(body) as Record<string, unknown>;
        body = JSON.stringify(
          Object.fromEntries(
            bodyFields
              .filter((name) => Object.hasOwn(input, name))
              .map((name) => [name, input[name]]),
          ),
        );
      }

      if (authAction) {
        return await handleAuth(authAction, request, headers, secure, body);
      }

      const backendPath = typeof path === "string" ? path : path(await context!.params);
      const token = authenticated
        ? requestJwt(request.headers.get("cookie"), config.accessCookie)
        : undefined;
      const visitorHeaders = new Headers();
      const guestId = authenticated
        ? visitorId(request.headers.get("cookie"), visitorHeaders, secure)
        : undefined;
      const response = await backendRequest(backendPath, {
        method,
        body,
        query: allowedQuery(request.url, query),
        signal: request.signal,
        requestId,
        token,
        guestId,
        owner: authenticated ? (request.headers.get("x-account-owner") ?? undefined) : undefined,
      });
      if (response.status >= 400) {
        throw backendError(response.status, response.data);
      }

      const data = responseBody ? responseBody(response.data) : response.data;
      for (const cookie of visitorHeaders.getSetCookie()) {
        headers.append("Set-Cookie", cookie);
      }

      return response.status === 204
        ? new Response(null, { status: 204, headers })
        : Response.json(data, { status: response.status, headers });
    } catch (error) {
      const failure =
        error instanceof ApiError
          ? error
          : new ApiError(500, "요청을 처리하지 못했어요.", "INTERNAL_ERROR");
      if (failure.status === 401) {
        // Keep credentials on resource failures: a concurrent refresh may have replaced them.
        // Only a rejected refresh explicitly ends the browser's authentication.
        if (authAction === "refresh" && secure !== undefined) {
          clearTokens(headers, secure);
        }

        headers.set("WWW-Authenticate", "Bearer");
      }

      return Response.json(
        { error: { code: failure.code, message: failure.message } },
        { status: failure.status, headers },
      );
    }
  };
}
