import { queryOptions } from "@tanstack/react-query";
import { request } from "@/lib/api/client";
import type { Session, Credentials, Registration } from "@/features/account/model/account";

export const sessionKey = ["session"] as const;
export const sessionQueryOptions = queryOptions({
  queryKey: sessionKey,
  queryFn: ({ signal }) => request<Session>("/session", { signal }),
  staleTime: 30_000,
});
export const login = (input: Credentials) =>
  request<Session>("/auth/login", { method: "POST", body: JSON.stringify(input) });
export const register = (input: Registration) =>
  request<Session>("/auth/register", { method: "POST", body: JSON.stringify(input) });
export const logout = () => request<Session>("/auth/logout", { method: "POST" });
