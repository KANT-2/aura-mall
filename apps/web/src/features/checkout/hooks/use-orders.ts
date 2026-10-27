"use client";
import { useQuery } from "@tanstack/react-query";
import { useAccount } from "@/features/account/hooks/use-account";
import { getOrders, orderKey } from "@/features/checkout/api/orders";
export function useOrders(enabled = true) {
  const { user, owner } = useAccount();
  return useQuery({
    queryKey: orderKey(owner),
    queryFn: ({ signal }) => getOrders(signal),
    enabled: enabled && !!user,
  });
}
