import { queryOptions } from "@tanstack/react-query";
import { request } from "@/lib/api/client";
import type { Catalog } from "@/features/catalog/model/catalog";
export const catalogKey = ["catalog"] as const;
export const catalogQueryOptions = queryOptions({
  queryKey: catalogKey,
  queryFn: ({ signal }) => request<Catalog>("/catalog", { signal }),
  staleTime: 300_000,
  // Stock can change in an admin tab while the storefront is still open.
  refetchOnMount: "always",
  refetchOnWindowFocus: "always",
});
