"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** The admin area has its own shell; consumer navigation, onboarding and footer stay out of it. */
export function StorefrontOnly({ children }: { children: ReactNode }) {
  const path = usePathname();
  return path === "/admin" || path.startsWith("/admin/") ? null : children;
}
