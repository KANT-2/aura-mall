"use client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { catalogQueryOptions } from "../api/catalog";
export function useCatalog() {
  return useSuspenseQuery(catalogQueryOptions).data;
}
