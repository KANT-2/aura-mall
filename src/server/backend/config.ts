import "server-only";
import { ApiError } from "@/lib/api/errors";

/** Read at request time so the same Next build can target Mock or FastAPI. */
export function backendConfig() {
  try {
    const baseUrl = new URL(process.env.API_URL ?? "http://127.0.0.1:4000");
    const prefix = process.env.API_PREFIX ?? "/api";
    const sessionCookie = process.env.API_SESSION_COOKIE ?? "aura_mock_session";
    const timeoutMs = Number(process.env.API_TIMEOUT_MS ?? 10000);
    const appOrigin = process.env.APP_ORIGIN ? new URL(process.env.APP_ORIGIN).origin : undefined;
    if (
      !["http:", "https:"].includes(baseUrl.protocol) ||
      baseUrl.username ||
      baseUrl.password ||
      baseUrl.search ||
      baseUrl.hash ||
      !/^\/(?:[a-zA-Z0-9_-]+\/?)*$/.test(prefix) ||
      !/^[!#$%&'*+.^_`|~a-zA-Z0-9-]+$/.test(sessionCookie) ||
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > 60000 ||
      (appOrigin !== undefined && !/^https?:\/\//.test(appOrigin))
    ) {
      throw new Error("Invalid backend configuration");
    }
    const base = baseUrl.href.replace(/\/$/, "");
    return { apiUrl: `${base}${prefix.replace(/\/$/, "")}`, sessionCookie, timeoutMs, appOrigin };
  } catch {
    throw new ApiError(500, "API 서버 설정을 확인해 주세요.", "CONFIGURATION_ERROR");
  }
}
