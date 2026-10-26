import { AdminProductList } from "@/features/admin/components/product-list";
import { adminQueries, readAdminQuery } from "@/features/admin/model/admin";

type SearchParams = Record<string, string | string[] | undefined>;
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return <AdminProductList query={readAdminQuery(await searchParams, adminQueries.products)} />;
}
