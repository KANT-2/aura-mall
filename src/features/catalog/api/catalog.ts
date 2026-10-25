import { queryOptions } from "@tanstack/react-query";
import { request } from "@/lib/api/client";
import type { Catalog } from "../model/catalog";
export const catalogKey = ["catalog"] as const;
export const catalogQueryOptions = queryOptions({
  queryKey: catalogKey,
  queryFn: ({ signal }) => request<Catalog>("/catalog", { signal }),
  staleTime: 300_000,
});
