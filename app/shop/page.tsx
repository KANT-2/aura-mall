import { redirect } from "next/navigation"
export default async function Page({ searchParams }: { searchParams: Promise<{ family?: string }> }) {
  const { family } = await searchParams
  redirect(family ? `/products?family=${encodeURIComponent(family)}` : "/products")
}
