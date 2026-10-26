"use client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { catalogQueryOptions } from "@/features/catalog/api/catalog";
export function useCatalog() {
  return useSuspenseQuery(catalogQueryOptions).data;
}
