"use client";
import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, QueryErrorResetBoundary } from "@tanstack/react-query";
import { NotificationProvider } from "@/components/feedback/notification-provider";
import { subscribeMemberChanges } from "@/lib/api/auth-events";
import { applyMemberChange } from "@/features/account/hooks/member-cache";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }),
  );
  useEffect(() => {
    const unsubscribe = subscribeMemberChanges((event) => applyMemberChange(client, event));
    const recheck = () => {
      void client.invalidateQueries({ queryKey: ["account"] });
    };
    window.addEventListener("focus", recheck);
    return () => {
      unsubscribe();
      window.removeEventListener("focus", recheck);
    };
  }, [client]);
  return (
    <QueryClientProvider client={client}>
      <QueryErrorResetBoundary>
        <NotificationProvider>{children}</NotificationProvider>
      </QueryErrorResetBoundary>
    </QueryClientProvider>
  );
}
