"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  login,
  logout,
  register,
  accountKey,
  accountQueryOptions,
} from "@/features/account/api/account";
import type { Credentials, Registration, AccountState } from "@/features/account/model/account";

type AuthCommand =
  | { type: "login"; input: Credentials }
  | { type: "register"; input: Registration }
  | { type: "logout" };
export function useAuth() {
  const client = useQueryClient();
  const mutation = useMutation({
    async mutationFn(command: AuthCommand) {
      await client.ensureQueryData(accountQueryOptions);
      switch (command.type) {
        case "login":
          return login(command.input);
        case "register":
          return register(command.input);
        case "logout":
          return logout();
      }
    },
    async onSuccess(account: AccountState) {
      await client.cancelQueries({
        predicate: (query) => ["account", "recipes", "orders"].includes(String(query.queryKey[0])),
      });
      client.removeQueries({
        predicate: (query) => ["recipes", "orders", "admin"].includes(String(query.queryKey[0])),
      });
      client.setQueryData(accountKey, account);
    },
  });
  return {
    pending: mutation.isPending,
    signIn: (email: string, password: string) =>
      mutation.mutateAsync({ type: "login", input: { email, password } }),
    signUp: (name: string, email: string, password: string, marketing = false) =>
      mutation.mutateAsync({ type: "register", input: { name, email, password, marketing } }),
    signOut: () => mutation.mutateAsync({ type: "logout" }),
  };
}
