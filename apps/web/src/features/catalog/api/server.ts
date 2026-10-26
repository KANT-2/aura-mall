import "server-only";
import { cache } from "react";
import { ApiError } from "@/lib/api/errors";
import { serverRequest } from "@/lib/api/server";
import { catalogResponse, productResponse } from "@/server/backend/storefront";

export const getServerCatalog = cache(() => serverRequest("/catalog", catalogResponse));
export const getServerProduct = cache(async (id: string) => {
  try {
    return await serverRequest(`/catalog/products/${encodeURIComponent(id)}`, productResponse);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }

    throw error;
  }
});
