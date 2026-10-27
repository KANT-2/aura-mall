import "server-only";
import { ApiError } from "@/lib/api/errors";
import { backendConfig } from "@/server/backend/config";
import { backendError, backendRequest } from "@/server/backend/transport";
import { adminAccountResponse } from "@/server/backend/admin";
import { integer, invalidResponse, record, text } from "@/server/backend/decode";
import { isJwt, requestJwt, tokenCookie } from "@/server/bff/token-cookie";

export type AdminAuthAction = "login" | "me" | "logout";
export function clearAdminToken(headers: Headers, secure: boolean) {
  headers.append(
    "Set-Cookie",
    tokenCookie(backendConfig().adminCookie, "", 0, secure, "/api/admin"),
  );
}

/** Administrator JWTs are independent of customer Access/Refresh tokens. */
export async function handleAdminAuth(
  action: AdminAuthAction,
  request: Request,
  headers: Headers,
  secure: boolean,
  body?: string,
) {
  const config = backendConfig();
  const token =
    action === "login" ? undefined : requestJwt(request.headers.get("cookie"), config.adminCookie);
  if (action !== "login" && !token) {
    if (action === "logout") {
      clearAdminToken(headers, secure);
    }

    return Response.json({ admin: null }, { headers });
  }

  const result = await backendRequest(
    action === "me" ? "/admin/session" : `/admin/auth/${action}`,
    {
      method: action === "me" ? "GET" : "POST",
      token,
      body: action === "login" ? body : undefined,
      signal: request.signal,
      requestId: headers.get("X-Request-ID")!,
    },
  );
  if (result.status >= 400) {
    if (result.status === 401 && action !== "login") {
      clearAdminToken(headers, secure);
      return Response.json({ admin: null }, { headers });
    }

    throw backendError(result.status, result.data);
  }

  if (action === "logout") {
    if (result.status !== 204) {
      return invalidResponse();
    }

    clearAdminToken(headers, secure);
    return Response.json({ admin: null }, { headers });
  }

  if (action === "login") {
    const data = record(result.data);
    const accessToken = text(data.accessToken);
    const ttl = integer(data.expiresIn);
    const admin = adminAccountResponse(data.admin);
    if (!isJwt(accessToken) || data.tokenType !== "Bearer" || ttl < 1 || ttl > 86400) {
      throw new ApiError(
        502,
        "API 서버의 인증 응답을 확인하지 못했어요.",
        "INVALID_BACKEND_RESPONSE",
      );
    }

    headers.append(
      "Set-Cookie",
      tokenCookie(config.adminCookie, accessToken, ttl, secure, "/api/admin"),
    );
    return Response.json({ admin }, { headers });
  }

  return Response.json({ admin: adminAccountResponse(result.data) }, { headers });
}
