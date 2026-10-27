import { queryOptions } from "@tanstack/react-query";
import type { Credentials, Registration } from "@/features/account/model/account";
import type { AdminAccount, AdminAccountState } from "@/features/admin/model/admin";
import { request } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";

export const adminAccountKey = ["admin-account"] as const;
export const adminAccountQueryOptions = queryOptions({
  queryKey: adminAccountKey,
  async queryFn({ signal }): Promise<AdminAccountState> {
    try {
      return await request<AdminAccountState>("/admin/auth/me", { signal });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        return { admin: null };
      }

      throw error;
    }
  },
  staleTime: 15000,
  retry: (count, error) => count < 1 && !(error instanceof ApiError && error.status < 500),
});
export const adminLogin = (input: Credentials) =>
  request<AdminAccountState>("/admin/auth/login", { method: "POST", body: JSON.stringify(input) });
export const adminLogout = () =>
  request<AdminAccountState>("/admin/auth/logout", { method: "POST" });
export const createAdmin = (input: Omit<Registration, "marketing">) =>
  request<AdminAccount>("/admin/admins", { method: "POST", body: JSON.stringify(input) });
