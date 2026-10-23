import { ProductDetail } from "@/components/editorial/Aura";
import catalog from "@/components/editorial/catalog.json";
import { notFound } from "next/navigation";
export function generateStaticParams() {
  return catalog.products.map((p) => ({ id: p.id }));
}
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const aliases: Record<string, string> = {
    "bergamot-veil": "fresh-eau-de-parfum",
    "petal-haze": "soft-eau-de-parfum",
    "cedar-trace": "warm-eau-de-parfum",
    "soft-skin": "soft-eau-de-parfum",
    "fig-reverie": "soft-eau-de-parfum",
    "amber-dusk": "warm-eau-de-parfum",
  };
  const p = catalog.products.find((p) => p.id === (aliases[id] || id));
  if (!p) notFound();
  return <ProductDetail product={p} />;
}
