import type { QueryClient } from "@tanstack/react-query";
import { accountKey } from "@/features/account/api/account";
import type { AccountState } from "@/features/account/model/account";

export function applyMemberChange(
  client: QueryClient,
  event: { owner: string; kind: "profile" | "ended" | "session"; remote: boolean },
) {
  const current = client.getQueryData<AccountState>(accountKey);
  if (event.kind === "session") {
    if (event.remote) {
      // Never trust a storage event as identity. Hide cached ownership, then ask the BFF.
      void client.cancelQueries({ queryKey: accountKey });
      void client.resetQueries({ queryKey: accountKey, exact: true });
    }

    return;
  }

  if (event.kind === "ended") {
    const owned = (query: { queryKey: readonly unknown[] }) =>
      ["recipes", "orders"].includes(String(query.queryKey[0])) &&
      query.queryKey[1] === event.owner;
    void client.cancelQueries({ predicate: owned });
    client.removeQueries({ predicate: owned });
    if (current?.user?.id === event.owner) {
      void client.cancelQueries({ queryKey: accountKey });
      client.setQueryData(accountKey, { ...current, user: null });
      if (event.remote) {
        void client.invalidateQueries({ queryKey: accountKey });
      }

      return;
    }
  }

  void client.invalidateQueries({ queryKey: accountKey });
}
