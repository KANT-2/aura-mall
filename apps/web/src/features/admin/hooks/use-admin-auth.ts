"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminAccountKey,
  adminAccountQueryOptions,
  adminLogin,
  adminLogout,
} from "@/features/admin/api/auth";
import type { Credentials } from "@/features/account/model/account";

export const useAdminAccount = () => useQuery(adminAccountQueryOptions);
export function useAdminAuth() {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (command: { type: "login"; input: Credentials } | { type: "logout" }) =>
      command.type === "login" ? adminLogin(command.input) : adminLogout(),
    async onSuccess(account) {
      await client.cancelQueries({
        predicate: (query) => ["admin", "admin-account"].includes(String(query.queryKey[0])),
      });
      client.removeQueries({ predicate: (query) => query.queryKey[0] === "admin" });
      client.setQueryData(adminAccountKey, account);
    },
  });
  return {
    pending: mutation.isPending,
    signIn: (input: Credentials) => mutation.mutateAsync({ type: "login", input }),
    signOut: () => mutation.mutateAsync({ type: "logout" }),
  };
}
