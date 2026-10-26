import { notFound } from "next/navigation";
import { ProductDetail } from "@/features/catalog/components/product-detail-client";
import { getServerProduct } from "@/features/catalog/api/server";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const product = await getServerProduct((await params).id);
  if (!product) {
    notFound();
  }
  return <ProductDetail key={product.id} product={product} />;
}
