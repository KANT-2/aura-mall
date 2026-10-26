import { AdminInquiryList } from "@/features/admin/components/inquiry-screens";
import { adminQueries, readAdminQuery } from "@/features/admin/model/admin";

type SearchParams = Record<string, string | string[] | undefined>;
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return <AdminInquiryList query={readAdminQuery(await searchParams, adminQueries.inquiries)} />;
}
