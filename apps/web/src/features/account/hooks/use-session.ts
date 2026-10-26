"use client";
import { useQuery } from "@tanstack/react-query";
import { sessionQueryOptions } from "@/features/account/api/session";

export function useSession() {
  const query = useQuery({ ...sessionQueryOptions, throwOnError: true });
  return {
    user: query.data?.user ?? null,
    guestId: query.data?.guestId,
    owner: query.data ? (query.data.user?.id ?? query.data.guestId) : undefined,
    ready: query.isSuccess,
    error: query.error,
  };
}
