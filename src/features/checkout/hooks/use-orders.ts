"use client";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/account/hooks/use-session";
import { getOrders, orderKey } from "../api/orders";
export function useOrders(enabled = true) {
  const { user, owner } = useSession();
  return useQuery({
    queryKey: orderKey(owner),
    queryFn: ({ signal }) => getOrders(signal),
    enabled: enabled && !!user,
  });
}
