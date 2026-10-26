"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  login,
  logout,
  register,
  sessionKey,
  sessionQueryOptions,
} from "@/features/account/api/session";
import type { Credentials, Registration, Session } from "@/features/account/model/account";

type AuthCommand =
  | { type: "login"; input: Credentials }
  | { type: "register"; input: Registration }
  | { type: "logout" };
export function useAuth() {
  const client = useQueryClient();
  const mutation = useMutation({
    async mutationFn(command: AuthCommand) {
      await client.ensureQueryData(sessionQueryOptions);
      switch (command.type) {
        case "login":
          return login(command.input);
        case "register":
          return register(command.input);
        case "logout":
          return logout();
      }
    },
    async onSuccess(session: Session) {
      await client.cancelQueries({
        predicate: (query) =>
          ["session", "cart", "recipes", "orders"].includes(String(query.queryKey[0])),
      });
      client.removeQueries({
        predicate: (query) => ["cart", "recipes", "orders"].includes(String(query.queryKey[0])),
      });
      client.setQueryData(sessionKey, session);
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
