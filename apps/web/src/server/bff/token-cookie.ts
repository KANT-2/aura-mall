import "server-only";
import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api/errors";

export const isJwt = (value: string) =>
  value.length <= 3800 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
export const isRefreshToken = (value: string) => /^r1_[A-Za-z0-9_-]{64}$/.test(value);

export function readCookie(cookie: string | null, name: string) {
  const matches =
    cookie
      ?.split(";")
      .map((part) => part.trim())
      .filter((part) => part.startsWith(`${name}=`)) ?? [];
  if (matches.length > 1) {
    throw new ApiError(401, "다시 로그인해 주세요.", "INVALID_TOKEN");
  }

  return matches[0]?.slice(name.length + 1);
}

/** Syntax only. FastAPI verifies signatures, claims, revocation and account status. */
export function requestJwt(cookie: string | null, name: string) {
  const token = readCookie(cookie, name);
  if (token !== undefined && !isJwt(token)) {
    throw new ApiError(401, "다시 로그인해 주세요.", "INVALID_TOKEN");
  }

  return token;
}

export function tokenCookie(
  name: string,
  value: string,
  maxAge: number,
  secure: boolean,
  path = "/",
) {
  return `${name}=${value}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

/** A visitor identifier never grants access to a member API. No server session exists. */
export function visitorId(cookie: string | null, headers: Headers, secure: boolean) {
  const value = readCookie(cookie, "aura_guest");
  if (
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    return value;
  }

  const guestId = randomUUID();
  headers.append("Set-Cookie", tokenCookie("aura_guest", guestId, 31536000, secure));
  return guestId;
}
