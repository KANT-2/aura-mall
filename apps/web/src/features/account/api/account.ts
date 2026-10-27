import { queryOptions } from "@tanstack/react-query";
import { request } from "@/lib/api/client";
import type { AccountState, Credentials, Registration } from "@/features/account/model/account";

export const accountKey = ["account"] as const;
export const accountQueryOptions = queryOptions({
  queryKey: accountKey,
  queryFn: ({ signal }) => request<AccountState>("/auth/me", { signal }),
  staleTime: 30_000,
});
export const login = (input: Credentials) =>
  request<AccountState>("/auth/login", { method: "POST", body: JSON.stringify(input) });
export const register = (input: Registration) =>
  request<AccountState>("/auth/register", { method: "POST", body: JSON.stringify(input) });
export const logout = () => request<AccountState>("/auth/logout", { method: "POST" });
