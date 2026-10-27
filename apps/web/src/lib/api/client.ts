import { ApiError } from "@/lib/api/errors";
import { publishMemberChange } from "@/lib/api/auth-events";

let refreshing: Promise<boolean> | undefined;
const localLocks = new Map<string, Promise<unknown>>();
async function withAuthLock<T>(operation: () => Promise<T>, name = "aura-jwt-auth"): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks) {
    const pending = (localLocks.get(name) ?? Promise.resolve()).catch(() => {}).then(operation);
    localLocks.set(name, pending);
    try {
      return await pending;
    } finally {
      if (localLocks.get(name) === pending) {
        localLocks.delete(name);
      }
    }
  }

  let result!: T;
  await locks.request(name, async () => {
    result = await operation();
  });
  return result;
}
async function refreshAccess(locked = false) {
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
  if (locked) {
    return renew();
  }

  if (!refreshing) {
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
  const admin = path.startsWith("/admin/");
  const adminMutation = ["/admin/auth/login", "/admin/auth/logout"].includes(path);
  const authMutation = ["/auth/login", "/auth/register", "/auth/logout"].includes(path);
  const method = (options.method ?? "GET").toUpperCase();
  const memberMutation =
    (path === "/auth/me" && ["PATCH", "DELETE"].includes(method)) ||
    (path === "/auth/change-password" && method === "POST");
  const execute = async (locked: boolean) => {
    let response = await sendRequest();
    if (
      response.status === 401 &&
      !admin &&
      !["/auth/login", "/auth/register", "/auth/refresh"].includes(path)
    ) {
      const renewed = await refreshAccess(locked);
      if (renewed || path === "/auth/me" || path === "/auth/logout") {
        // One retry only. A 401 is rejected before any protected operation executes.
        response = await sendRequest();
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

    const owner = headers.get("X-Account-Owner");
    if (memberMutation && owner) {
      publishMemberChange(owner, method === "PATCH" ? "profile" : "ended");
    }

    return body as T;
  };
  if (adminMutation) {
    return withAuthLock(() => execute(false), "aura-admin-jwt-auth");
  }

  return authMutation || memberMutation || path === "/auth/me"
    ? withAuthLock(() => execute(true))
    : execute(false);
}
