import { Auth } from "@/features/account/components/auth-form";
import { safeReturnPath } from "@/lib/navigation";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  return <Auth mode="register" returnTo={safeReturnPath((await searchParams).next)} />;
}
