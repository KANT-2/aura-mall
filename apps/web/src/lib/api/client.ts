import { ApiError } from "@/lib/api/errors";

let refreshing: Promise<boolean> | undefined;
async function withAuthLock<T>(operation: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks) {
    return operation();
  }

  let result!: T;
  await locks.request("aura-jwt-auth", async () => {
    result = await operation();
  });
  return result;
}
async function refreshAccess() {
  if (!refreshing) {
    const renew = async () => {
      // Recheck inside the cross-tab lock: another request may already have rotated the token.
      const current = await fetch("/api/auth/me", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (current.ok && (await current.json()).user) {
        return true;
      }

      if (!current.ok && current.status !== 401) {
        throw new ApiError(current.status, "인증 상태를 확인하지 못했어요.");
      }

      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok && response.status !== 401) {
        throw new ApiError(response.status, "인증 토큰을 갱신하지 못했어요.");
      }

      return response.ok;
    };
    refreshing = withAuthLock(renew).finally(() => {
      refreshing = undefined;
    });
  }

  return refreshing;
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const sendRequest = () =>
    fetch(`/api${path}`, {
      credentials: "same-origin",
      ...options,
      headers,
    });
  const authMutation = ["/auth/login", "/auth/register", "/auth/logout"].includes(path);
  const send = () => (authMutation ? withAuthLock(sendRequest) : sendRequest());
  let response = await send();
  if (
    response.status === 401 &&
    !["/auth/login", "/auth/register", "/auth/refresh"].includes(path)
  ) {
    const renewed = await refreshAccess();
    if (renewed || path === "/auth/me" || path === "/auth/logout") {
      // One retry only. A 401 is rejected before any protected operation executes.
      response = await send();
    }
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.error?.message ?? "요청을 처리하지 못했어요.",
      body?.error?.code,
    );
  }

  return body as T;
}
