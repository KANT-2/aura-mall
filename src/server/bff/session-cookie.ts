import "server-only";

/** Never forward unrelated application, analytics or infrastructure cookies. */
export function requestSessionCookie(cookie: string | null, name: string) {
  return cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
}

/** Bind the backend session to the BFF host, including expiry and deletion. */
export function responseSessionCookies(values: string[], name: string, secure: boolean) {
  return values.flatMap((value) => {
    const [pair, ...attributes] = value.split(";").map((part) => part.trim());
    if (!pair.startsWith(`${name}=`)) {
      return [];
    }
    const expiry = attributes.filter((attribute) => /^expires=|^max-age=/i.test(attribute));
    return [
      [pair, "Path=/", "HttpOnly", "SameSite=Lax", ...(secure ? ["Secure"] : []), ...expiry].join(
        "; ",
      ),
    ];
  });
}
