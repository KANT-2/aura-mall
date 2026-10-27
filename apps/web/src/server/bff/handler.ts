import "server-only";
import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api/errors";
import { backendConfig } from "@/server/backend/config";
import { backendRequest, backendError } from "@/server/backend/transport";
import {
  clearSessionCookie,
  requestJwt,
  requestSessionCookie,
  responseSessionCookies,
} from "@/server/bff/session-cookie";
import { jsonRequestBody } from "@/server/bff/request-body";
import { requestOrigin } from "@/server/bff/request-origin";
import { publicSession } from "@/server/bff/session-response";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type Params = Record<string, string>;
type BackendPath = string | ((params: Params) => string);
type RouteContext = { params: Promise<Params> };
type HandlerOptions = {
  session?: boolean;
  query?: readonly string[];
  sessionResponse?: boolean;
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
  { session = true, query, sessionResponse = false, bodyFields, responseBody }: HandlerOptions = {},
) {
  return async function handle(request: Request, context?: RouteContext) {
    const requestId = randomUUID();
    const headers = new Headers({
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Request-ID": requestId,
      ...(session ? { Vary: "Cookie" } : {}),
    });
    let jwtCookie: { name: string; secure: boolean } | undefined;
    try {
      const config = backendConfig();
      const origin = requestOrigin(request, config.appOrigin);
      const jwt = session && config.authMode === "jwt";
      if (jwt) {
        jwtCookie = { name: config.sessionCookie, secure: origin.startsWith("https:") };
      }

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

      const backendPath = typeof path === "string" ? path : path(await context!.params);
      const response = await backendRequest(backendPath, {
        method,
        body,
        query: allowedQuery(request.url, query),
        signal: request.signal,
        requestId,
        cookie:
          session && !jwt
            ? requestSessionCookie(request.headers.get("cookie"), config.sessionCookie)
            : undefined,
        token: jwt ? requestJwt(request.headers.get("cookie"), config.sessionCookie) : undefined,
        owner: session ? (request.headers.get("x-session-owner") ?? undefined) : undefined,
      });
      if (response.status >= 400 && jwt) {
        throw backendError(response.status, response.data);
      }

      let data = response.data;
      if (response.status < 400) {
        if (jwt && sessionResponse) {
          data = publicSession(data);
        } else if (responseBody) {
          data = responseBody(data);
        }
      }

      if (session) {
        for (const cookie of responseSessionCookies(
          response.cookies,
          config.sessionCookie,
          origin.startsWith("https:"),
          jwt,
        )) {
          headers.append("Set-Cookie", cookie);
        }
      }

      if (response.status >= 400) {
        throw backendError(response.status, response.data);
      }

      return response.status === 204
        ? new Response(null, { status: 204, headers })
        : Response.json(data, { status: response.status, headers });
    } catch (error) {
      const failure =
        error instanceof ApiError
          ? error
          : new ApiError(500, "요청을 처리하지 못했어요.", "INTERNAL_ERROR");
      if (jwtCookie && failure.status === 401) {
        headers.append("Set-Cookie", clearSessionCookie(jwtCookie.name, jwtCookie.secure));
        // FastAPI uses a fixed challenge; never echo arbitrary upstream header parameters.
        headers.set("WWW-Authenticate", "Bearer");
      }

      return Response.json(
        { error: { code: failure.code, message: failure.message } },
        { status: failure.status, headers },
      );
    }
  };
}
