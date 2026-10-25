"use client";
import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, QueryErrorResetBoundary } from "@tanstack/react-query";
import { NotificationProvider } from "@/components/feedback/notification-provider";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <QueryErrorResetBoundary>
        <NotificationProvider>{children}</NotificationProvider>
      </QueryErrorResetBoundary>
    </QueryClientProvider>
  );
}
