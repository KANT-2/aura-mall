"use client";
import { useQuery } from "@tanstack/react-query";
import { accountQueryOptions } from "@/features/account/api/account";

export function useAccount() {
  const query = useQuery({ ...accountQueryOptions, throwOnError: true });
  return {
    user: query.data?.user ?? null,
    guestId: query.data?.guestId,
    owner: query.data ? (query.data.user?.id ?? query.data.guestId) : undefined,
    ready: query.isSuccess,
    error: query.error,
  };
}
