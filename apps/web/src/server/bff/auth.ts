import "server-only";
import { ApiError } from "@/lib/api/errors";
import type { Member } from "@/features/account/model/account";
import { isRecord } from "@/lib/validation";
import { backendConfig } from "@/server/backend/config";
import { backendRequest, backendError } from "@/server/backend/transport";
import {
  isJwt,
  isRefreshToken,
  readCookie,
  requestJwt,
  tokenCookie,
  visitorId,
} from "@/server/bff/token-cookie";

export type AuthAction =
  | "login"
  | "register"
  | "me"
  | "refresh"
  | "logout"
  | "update-profile"
  | "change-password"
  | "deactivate";
const invalid = () =>
  new ApiError(502, "API 서버의 인증 응답을 확인하지 못했어요.", "INVALID_BACKEND_RESPONSE");

export function publicMember(data: unknown): Member {
  if (
    !isRecord(data) ||
    typeof data.id !== "string" ||
    !data.id ||
    typeof data.email !== "string" ||
    typeof data.name !== "string" ||
    typeof data.coupon !== "boolean" ||
    (data.marketing !== undefined && typeof data.marketing !== "boolean") ||
    (data.role !== undefined && data.role !== "member" && data.role !== "admin")
  ) {
    throw invalid();
  }

  return {
    id: data.id,
    email: data.email,
    name: data.name,
    coupon: data.coupon,
    ...(data.marketing !== undefined ? { marketing: data.marketing } : {}),
    ...(data.role !== undefined ? { role: data.role } : {}),
  };
}

function tokenPair(data: unknown) {
  if (
    !isRecord(data) ||
    typeof data.accessToken !== "string" ||
    !isJwt(data.accessToken) ||
    typeof data.refreshToken !== "string" ||
    !isRefreshToken(data.refreshToken) ||
    data.tokenType !== "Bearer" ||
    !Number.isSafeInteger(data.expiresIn) ||
    Number(data.expiresIn) <= 0 ||
    Number(data.expiresIn) > 86400 ||
    !Number.isSafeInteger(data.refreshExpiresIn) ||
    Number(data.refreshExpiresIn) <= 0 ||
    Number(data.refreshExpiresIn) > 31536000
  ) {
    throw invalid();
  }

  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresIn: Number(data.expiresIn),
    refreshExpiresIn: Number(data.refreshExpiresIn),
  };
}

export function clearTokens(headers: Headers, secure: boolean) {
  const config = backendConfig();
  headers.append("Set-Cookie", tokenCookie(config.accessCookie, "", 0, secure));
  headers.append("Set-Cookie", tokenCookie(config.refreshCookie, "", 0, secure, "/api/auth"));
}

/** Adapt TokenPair JSON to HttpOnly cookies. Never turn a token into a server session. */
export async function handleAuth(
  action: AuthAction,
  request: Request,
  headers: Headers,
  secure: boolean,
  body?: string,
) {
  const config = backendConfig();
  const cookie = request.headers.get("cookie");
  const requestId = headers.get("X-Request-ID")!;
  const upstream = async (path: string, method = "GET", token?: string, input?: string) => {
    const result = await backendRequest(path, {
      method,
      token,
      body: input,
      signal: request.signal,
      requestId,
    });
    if (result.status >= 400) {
      throw backendError(result.status, result.data);
    }

    return result;
  };
  if (action === "login" || action === "register" || action === "refresh") {
    let input = body;
    if (action === "refresh") {
      const refreshToken = readCookie(cookie, config.refreshCookie);
      if (!refreshToken || !isRefreshToken(refreshToken)) {
        throw new ApiError(401, "다시 로그인해 주세요.", "INVALID_TOKEN");
      }

      input = JSON.stringify({ refreshToken });
    }

    const result = await upstream(`/auth/${action}`, "POST", undefined, input);
    const pair = tokenPair(result.data);
    const user =
      action === "refresh"
        ? undefined
        : publicMember((await upstream("/auth/me", "GET", pair.accessToken)).data);
    const guestId = visitorId(cookie, headers, secure);
    headers.append(
      "Set-Cookie",
      tokenCookie(config.accessCookie, pair.accessToken, pair.expiresIn, secure),
    );
    headers.append(
      "Set-Cookie",
      tokenCookie(
        config.refreshCookie,
        pair.refreshToken,
        pair.refreshExpiresIn,
        secure,
        "/api/auth",
      ),
    );
    return action === "refresh"
      ? new Response(null, { status: 204, headers })
      : Response.json({ user, guestId }, { status: action === "register" ? 201 : 200, headers });
  }

  const token = requestJwt(cookie, config.accessCookie);
  if (["update-profile", "change-password", "deactivate"].includes(action)) {
    if (!token) {
      throw new ApiError(401, "로그인이 필요해요.", "TOKEN_REQUIRED");
    }

    const current = publicMember((await upstream("/auth/me", "GET", token)).data);
    if (current.role === "admin") {
      throw new ApiError(401, "회원 로그인이 필요해요.", "LOGIN_REQUIRED");
    }

    const expected = request.headers.get("x-account-owner");
    if (expected && expected !== current.id) {
      throw new ApiError(409, "계정이 변경됐어요. 다시 확인해 주세요.", "OWNER_CHANGED");
    }

    const result = await upstream(
      action === "change-password" ? "/auth/change-password" : "/auth/me",
      action === "update-profile" ? "PATCH" : action === "deactivate" ? "DELETE" : "POST",
      token,
      body,
    );
    if (action === "update-profile") {
      const user = publicMember(result.data);
      if (result.status !== 200 || user.id !== current.id || user.role === "admin") {
        throw invalid();
      }

      return Response.json({ user, guestId: visitorId(cookie, headers, secure) }, { headers });
    }

    if (result.status !== 204) {
      throw invalid();
    }

    clearTokens(headers, secure);
    return new Response(null, { status: 204, headers });
  }

  const refresh = readCookie(cookie, config.refreshCookie);
  if (!token && refresh !== undefined) {
    throw new ApiError(401, "인증 토큰 갱신이 필요해요.", "TOKEN_REQUIRED");
  }

  let user: Member | null = null;
  if (token) {
    if (action === "logout") {
      const result = await upstream("/auth/logout", "POST", token);
      if (result.status !== 204) {
        throw invalid();
      }
    } else {
      user = publicMember((await upstream("/auth/me", "GET", token)).data);
    }
  }

  const guestId = visitorId(cookie, headers, secure);
  if (action === "logout") {
    clearTokens(headers, secure);
  }

  return Response.json({ user, guestId }, { headers });
}
