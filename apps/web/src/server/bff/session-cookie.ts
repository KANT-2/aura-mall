import "server-only";
import { ApiError } from "@/lib/api/errors";

// Leave room for cookie attributes within browsers' 4 KiB cookie limit.
const MAX_JWT_LENGTH = 3800;
const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function isJwt(value: string) {
  return value.length <= MAX_JWT_LENGTH && JWT_PATTERN.test(value);
}

/** Syntax only: FastAPI alone verifies signatures, claims, revocation and permissions. */
export function requestJwt(cookie: string | null, name: string) {
  const matches =
    cookie
      ?.split(";")
      .map((part) => part.trim())
      .filter((part) => part.startsWith(`${name}=`)) ?? [];
  if (matches.length > 1) {
    throw new ApiError(401, "다시 로그인해 주세요.", "INVALID_SESSION");
  }

  const token = matches[0]?.slice(name.length + 1);
  if (token !== undefined && !isJwt(token)) {
    throw new ApiError(401, "다시 로그인해 주세요.", "INVALID_SESSION");
  }

  return token;
}

export function clearSessionCookie(name: string, secure: boolean) {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

/** Never forward unrelated application, analytics or infrastructure cookies. */
export function requestSessionCookie(cookie: string | null, name: string) {
  return cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
}

/** Bind the backend session to the BFF host, including expiry and deletion. */
export function responseSessionCookies(
  values: string[],
  name: string,
  secure: boolean,
  jwt = false,
) {
  return values.flatMap((value) => {
    const [pair, ...attributes] = value.split(";").map((part) => part.trim());
    if (!pair.startsWith(`${name}=`)) {
      return [];
    }

    const token = pair.slice(name.length + 1);
    if (jwt && token && !isJwt(token)) {
      throw new ApiError(
        502,
        "API 서버의 인증 응답을 확인하지 못했어요.",
        "INVALID_BACKEND_RESPONSE",
      );
    }

    const expiry = attributes.filter((attribute) => /^expires=|^max-age=/i.test(attribute));
    return [
      [pair, "Path=/", "HttpOnly", "SameSite=Lax", ...(secure ? ["Secure"] : []), ...expiry].join(
        "; ",
      ),
    ];
  });
}
