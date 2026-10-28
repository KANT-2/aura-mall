import "server-only";
import { ApiError } from "@/lib/api/errors";

/** Read at request time so the same Next build can target Mock or FastAPI. */
export function backendConfig() {
  try {
    const baseUrl = new URL(process.env.API_URL ?? "http://127.0.0.1:4000");
    const prefix = process.env.API_PREFIX ?? "/api";
    const accessCookie = process.env.API_ACCESS_COOKIE ?? "aura_access";
    const refreshCookie = process.env.API_REFRESH_COOKIE ?? "aura_refresh";
    const adminCookie = process.env.API_ADMIN_ACCESS_COOKIE ?? "aura_admin_access";
    const timeoutMs = Number(process.env.API_TIMEOUT_MS ?? 10000);
    const appOrigin = process.env.APP_ORIGIN ? new URL(process.env.APP_ORIGIN).origin : undefined;
    const bffSharedKey = process.env.API_BFF_SHARED_KEY || undefined;
    if (
      !["http:", "https:"].includes(baseUrl.protocol) ||
      baseUrl.username ||
      baseUrl.password ||
      baseUrl.search ||
      baseUrl.hash ||
      !/^\/(?:[a-zA-Z0-9_-]+\/?)*$/.test(prefix) ||
      ![accessCookie, refreshCookie, adminCookie].every((name) => /^[A-Za-z0-9_-]+$/.test(name)) ||
      new Set([accessCookie, refreshCookie, adminCookie, "aura_guest"]).size !== 4 ||
      (process.env.API_AUTH_MODE !== undefined && process.env.API_AUTH_MODE !== "jwt") ||
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > 60000 ||
      (appOrigin !== undefined && !/^https?:\/\//.test(appOrigin)) ||
      (bffSharedKey !== undefined && !/^[A-Za-z0-9_-]{32,128}$/.test(bffSharedKey))
    ) {
      throw new Error("Invalid backend configuration");
    }

    const base = baseUrl.href.replace(/\/$/, "");
    return {
      apiUrl: `${base}${prefix.replace(/\/$/, "")}`,
      accessCookie,
      refreshCookie,
      adminCookie,
      timeoutMs,
      appOrigin,
      bffSharedKey,
    };
  } catch {
    throw new ApiError(500, "API 서버 설정을 확인해 주세요.", "CONFIGURATION_ERROR");
  }
}
