import "server-only";
import { cache } from "react";
import { ApiError } from "@/lib/api/client";
import { serverRequest } from "@/lib/api/server";
import type { Catalog, Product } from "../model/catalog";

export const getServerCatalog = cache(() => serverRequest<Catalog>("/catalog"));
export const getServerProduct = cache(async (id: string) => {
  try {
    return await serverRequest<Product>(`/catalog/products/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
});
