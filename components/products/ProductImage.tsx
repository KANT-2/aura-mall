"use client"

import Image from "next/image"
import { useState } from "react"
import type { Product } from "@/types/product"

export function ProductImage({
  product,
  sizes,
  preload = false,
  className = "",
}: {
  product: Product
  sizes: string
  preload?: boolean
  className?: string
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  return (
    <span className={`product-image-frame ${className}`}>
      {failedSrc === product.imageUrl ? (
        <span
          aria-label={`${product.name} 이미지를 불러오지 못했어요`}
          className="product-image-fallback"
          role="img"
        >
          <span>AURA</span>
          <strong>{product.name}</strong>
        </span>
      ) : (
        <Image
          alt={`${product.name} 향수 보틀`}
          fill
          onError={() => setFailedSrc(product.imageUrl)}
          preload={preload}
          sizes={sizes}
          src={product.imageUrl}
        />
      )}
    </span>
  )
}
