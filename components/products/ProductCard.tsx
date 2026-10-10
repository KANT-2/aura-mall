import Link from "next/link"
import { formatPoint } from "@/data/products"
import type { Product } from "@/types/product"
import { ProductImage } from "./ProductImage"

export const productCardImageSizes = "(max-width: 560px) 100vw, (max-width: 900px) 50vw, 420px"

export function ProductCard({
  product,
  index = 0,
  onQuickView,
}: {
  product: Product
  index?: number
  /** 전달될 때만 미리보기 버튼을 표시한다 (홈 카드는 미사용). */
  onQuickView?: (product: Product, trigger: HTMLButtonElement) => void
}) {
  return (
    <article className="product-card">
      <div className="product-visual-wrap">
        <Link
          aria-label={`${product.name} 상세 보기`}
          className={`product-visual tone-${product.accent}`}
          href={`/products/${product.slug}`}
        >
          <span className="product-index">{String(index + 1).padStart(2, "0")}</span>
          <ProductImage product={product} sizes={productCardImageSizes} />
          <span className="product-image-name">{product.name}</span>
        </Link>
        {onQuickView && (
          <button
            aria-haspopup="dialog"
            className="quick-view-trigger"
            onClick={(event) => onQuickView(product, event.currentTarget)}
            type="button"
          >
            미리보기<span className="sr-only"> · {product.name}</span>
          </button>
        )}
      </div>
      <div className="product-card-info">
        <div>
          <p className="product-family">
            {product.family} · {product.volume}
          </p>
          <h3 className="product-name">{product.name}</h3>
          <p className="product-description">{product.description}</p>
        </div>
        <strong className="product-price">{formatPoint(product.price)}</strong>
      </div>
    </article>
  )
}
