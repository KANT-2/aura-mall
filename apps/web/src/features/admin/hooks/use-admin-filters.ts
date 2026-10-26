"use client";
import { usePathname, useRouter } from "next/navigation";
import { adminSearch, type AdminQuery } from "@/features/admin/model/admin";

/** Keep list filters in the URL so reloads, back navigation and shared links keep the view. */
export function useAdminFilters(query: AdminQuery) {
  const router = useRouter();
  const path = usePathname();
  return (changes: AdminQuery) => {
    // Any filter change returns to the first page unless a page is requested explicitly.
    const next = { ...query, page: undefined, ...changes };
    router.replace(path + adminSearch(next), { scroll: false });
  };
}
