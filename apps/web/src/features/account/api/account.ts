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

export const updateProfile = (owner: string, input: { name: string; marketing: boolean }) =>
  request<AccountState>("/auth/me", {
    method: "PATCH",
    headers: { "X-Account-Owner": owner },
    body: JSON.stringify(input),
  });
export const changePassword = (owner: string, currentPassword: string, newPassword: string) =>
  request<null>("/auth/change-password", {
    method: "POST",
    headers: { "X-Account-Owner": owner },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
export const deactivateAccount = (owner: string, currentPassword: string) =>
  request<null>("/auth/me", {
    method: "DELETE",
    headers: { "X-Account-Owner": owner },
    body: JSON.stringify({ currentPassword }),
  });
