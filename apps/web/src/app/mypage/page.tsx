import { MyPage } from "@/features/account/components/account-overview";
const tabs = new Set(["scents", "orders", "coupons", "questions", "account"]);
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const value = (await searchParams).tab;
  const tab = typeof value === "string" && tabs.has(value) ? value : "scents";
  return <MyPage key={tab} initialTab={tab} />;
}
