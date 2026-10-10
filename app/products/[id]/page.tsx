import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ProductDetailPage } from "@/components/AuraSite"
import { findProductBySlug, products } from "@/data/products"

// 폴더명은 [id]지만 실제 값은 slug (예: /products/bergamot-veil)
export function generateStaticParams() {
  return products.map(({ slug }) => ({ id: slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const product = findProductBySlug(id)
  return product ? { title: `${product.name} — AURA`, description: product.description } : {}
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const product = findProductBySlug(id)
  if (!product) notFound()
  return <ProductDetailPage product={product} />
}
