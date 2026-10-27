import type { QueryClient } from "@tanstack/react-query";
import { accountKey } from "@/features/account/api/account";
import type { AccountState } from "@/features/account/model/account";

export function applyMemberChange(
  client: QueryClient,
  event: { owner: string; kind: "profile" | "ended"; remote: boolean },
) {
  const current = client.getQueryData<AccountState>(accountKey);
  if (event.kind === "ended") {
    const owned = (query: { queryKey: readonly unknown[] }) =>
      ["recipes", "orders"].includes(String(query.queryKey[0])) &&
      query.queryKey[1] === event.owner;
    void client.cancelQueries({ predicate: owned });
    client.removeQueries({ predicate: owned });
    if (!event.remote && current?.user?.id === event.owner) {
      void client.cancelQueries({ queryKey: accountKey });
      client.setQueryData(accountKey, { ...current, user: null });
      return;
    }
  }

  void client.invalidateQueries({ queryKey: accountKey });
}
