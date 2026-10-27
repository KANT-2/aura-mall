import { AdminLogin } from "@/features/admin/components/admin-login";
import { safeReturnPath } from "@/lib/navigation";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const next = safeReturnPath((await searchParams).next, "/admin");
  const path = next.split(/[?#]/, 1)[0];
  const returnTo =
    (path === "/admin" || path.startsWith("/admin/")) && path !== "/admin/login" ? next : "/admin";
  return <AdminLogin returnTo={returnTo} />;
}
