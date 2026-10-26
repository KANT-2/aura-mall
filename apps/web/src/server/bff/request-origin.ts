import "server-only";

const loopback = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;

/** Next dev can build request.url with localhost even when a browser used 127.0.0.1. */
export function requestOrigin(request: Request, configuredOrigin?: string) {
  if (configuredOrigin) {
    return configuredOrigin;
  }

  const url = new URL(request.url);
  const host = request.headers.get("host");
  if (
    process.env.NODE_ENV === "development" &&
    loopback.test(url.host) &&
    host &&
    loopback.test(host)
  ) {
    const direct = new URL(`${url.protocol}//${host}`);
    if (direct.port === url.port) {
      return direct.origin;
    }
  }

  return url.origin;
}
