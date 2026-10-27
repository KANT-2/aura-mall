"use client";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { ApiError } from "@/lib/api/errors";
import { adminAccountKey } from "@/features/admin/api/auth";
import { catalogKey } from "@/features/catalog/api/catalog";
import {
  adjustStock,
  adminKeys,
  getInquiries,
  getInquiry,
  getOrder,
  getOrders,
  getOverview,
  getProduct,
  getProducts,
  updateInquiry,
  updateProduct,
} from "@/features/admin/api/admin";
import type {
  AdminInquiry,
  AdminProductDetail,
  AdminQuery,
  InquiryUpdate,
  ProductUpdate,
  StockAdjustmentInput,
} from "@/features/admin/model/admin";

const accessDenied = (error: unknown) =>
  error instanceof ApiError && (error.status === 401 || error.status === 403);
const options = {
  // Retrying a 4xx cannot succeed; only transient server failures are retried once.
  retry: (count: number, error: unknown) =>
    count < 1 && !(error instanceof ApiError && error.status < 500),
  staleTime: 15_000,
};

/** A 401/403 means the access token expired or the role was revoked; let the shell re-check. */
function onAccessError(client: QueryClient, error: unknown) {
  if (accessDenied(error)) {
    void client.invalidateQueries({ queryKey: adminAccountKey });
  }
}

function useAdminQuery<T>(
  queryKey: readonly unknown[],
  queryFn: (signal: AbortSignal) => Promise<T>,
  list = false,
) {
  const client = useQueryClient();
  return useQuery({
    ...options,
    queryKey,
    queryFn: async ({ signal }) => {
      try {
        return await queryFn(signal);
      } catch (error) {
        onAccessError(client, error);
        throw error;
      }
    },
    // Lists keep the previous page while filters change; details never show another record.
    placeholderData: list ? keepPreviousData : undefined,
  });
}

export const useAdminOverview = () => useAdminQuery(adminKeys.overview, getOverview);
export const useAdminProducts = (query: AdminQuery) =>
  useAdminQuery(adminKeys.products(query), (signal) => getProducts(query, signal), true);
export const useAdminProduct = (id: string) =>
  useAdminQuery(adminKeys.product(id), (signal) => getProduct(id, signal));
export const useAdminOrders = (query: AdminQuery) =>
  useAdminQuery(adminKeys.orders(query), (signal) => getOrders(query, signal), true);
export const useAdminOrder = (id: string) =>
  useAdminQuery(adminKeys.order(id), (signal) => getOrder(id, signal));
export const useAdminInquiries = (query: AdminQuery) =>
  useAdminQuery(adminKeys.inquiries(query), (signal) => getInquiries(query, signal), true);
export const useAdminInquiry = (id: string) =>
  useAdminQuery(adminKeys.inquiry(id), (signal) => getInquiry(id, signal));

function useAdminMutation<Input, Result>(
  mutationFn: (input: Input) => Promise<Result>,
  detailKey: readonly unknown[],
  related: (readonly unknown[])[],
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess(data) {
      client.setQueryData(detailKey, data);
      for (const queryKey of related) {
        void client.invalidateQueries({ queryKey });
      }
    },
    onError(error) {
      onAccessError(client, error);
      // A version conflict means someone else saved first; show the latest data before retrying.
      if (error instanceof ApiError && error.status === 409) {
        void client.invalidateQueries({ queryKey: detailKey });
      }
    },
  });
}

export function useProductCommands(id: string) {
  const related = [["admin", "products"], adminKeys.overview, catalogKey];
  const update = useAdminMutation<ProductUpdate, AdminProductDetail>(
    (input) => updateProduct(id, input),
    adminKeys.product(id),
    related,
  );
  const stock = useAdminMutation<StockAdjustmentInput, AdminProductDetail>(
    (input) => adjustStock(id, input),
    adminKeys.product(id),
    related,
  );
  return { update, stock };
}

export const useInquiryUpdate = (id: string) =>
  useAdminMutation<InquiryUpdate, AdminInquiry>(
    (input) => updateInquiry(id, input),
    adminKeys.inquiry(id),
    [["admin", "inquiries"], adminKeys.overview],
  );
