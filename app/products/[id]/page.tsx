import { notFound } from "next/navigation"
import { ProductDetailPage } from "@/components/AuraSite"
import { products } from "@/data/products"

export function generateStaticParams() {
  return products.map(({ slug }) => ({ id: slug }))
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const product = products.find(({ slug }) => slug === id)
  if (!product) notFound()
  return <ProductDetailPage product={product} />
}
