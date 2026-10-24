import { notFound } from "next/navigation";
import { findProduct, products } from "@/lib/aura/catalog";
import { ProductDetail } from "./ProductDetail";

export function generateStaticParams() {
  return products.map(({ id }) => ({ id }));
}

/** Keep alias resolution and missing-product handling identical for both URLs. */
export async function ProductRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = findProduct(id);
  if (!product) notFound();
  return <ProductDetail key={product.id} product={product} />;
}
