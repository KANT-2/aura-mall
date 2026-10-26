import { AdminOrderList } from "@/features/admin/components/order-screens";
import { adminQueries, readAdminQuery } from "@/features/admin/model/admin";

type SearchParams = Record<string, string | string[] | undefined>;
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return <AdminOrderList query={readAdminQuery(await searchParams, adminQueries.orders)} />;
}
