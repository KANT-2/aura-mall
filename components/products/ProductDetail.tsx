"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { formatPoint } from "@/data/products"
import type { Product } from "@/types/product"
import { getRelatedProducts, noteStages } from "./catalog"
import { ProductCard } from "./ProductCard"
import { ProductImage } from "./ProductImage"
import { QuickView, useQuickView } from "./QuickView"

/** 상세 화면이 전역 상태(AuraProviders)에서 필요로 하는 최소 인터페이스 */
export type ProductShopper = {
  isSignedIn: boolean
  points: number
  addToCart: (product: Product, quantity: number) => void
}

function ProductQuantity({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  return (
    <div aria-label="수량" className="quantity-control" role="group">
      <button aria-label="수량 줄이기" disabled={value <= 1} onClick={() => onChange(Math.max(1, value - 1))} type="button">
        −
      </button>
      <span aria-live="polite">{value}</span>
      <button aria-label="수량 늘리기" onClick={() => onChange(value + 1)} type="button">
        +
      </button>
    </div>
  )
}

export function ScentNotes({ product }: { product: Product }) {
  return (
    <section className="notes-section page-shell section-pad">
      <div className="section-heading">
        <p className="eyebrow">SCENT NOTES</p>
        <h2 className="section-title">피부 위에서 이어지는 향의 결</h2>
      </div>
      <div className="notes-grid">
        {noteStages.map((stage, index) => (
          <div className="note-item" key={stage.key}>
            <span>0{index + 1}</span>
            <p>{stage.label}</p>
            <h3>{product.notes[stage.key]}</h3>
            <p>{stage.copy}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

export function RelatedProducts({
  product,
  onQuickView,
}: {
  product: Product
  onQuickView: (product: Product, trigger: HTMLButtonElement) => void
}) {
  const { items, sameFamilyCount } = getRelatedProducts(product)
  if (!items.length) return null
  // 문구는 실제 선정 기준(같은 계열 우선 → 기본 순서로 보충)과 일치시킨다.
  const body =
    sameFamilyCount === items.length
      ? `${product.family} 계열의 다른 향을 모았어요.`
      : sameFamilyCount > 0
        ? `${product.family} 계열의 향을 먼저 보여드리고, 컬렉션의 다른 향을 함께 소개해요.`
        : `아직 ${product.family} 계열의 다른 향이 없어 컬렉션의 다른 향을 소개해요.`
  return (
    <section className="recommendations page-shell section-pad">
      <div className="section-heading">
        <p className="eyebrow">MORE IN AURA</p>
        <h2 className="section-title">이 향과 함께 둘러보세요</h2>
        <p className="section-copy">{body}</p>
      </div>
      <div className="product-grid compact">
        {items.map((item, index) => (
          <ProductCard index={index} key={item.slug} onQuickView={onQuickView} product={item} />
        ))}
      </div>
    </section>
  )
}

export function ProductDetail({ product, shopper }: { product: Product; shopper: ProductShopper }) {
  const [quantity, setQuantity] = useState(1)
  const [addedQuantity, setAddedQuantity] = useState<number | null>(null)
  const added = addedQuantity !== null
  const addedTimer = useRef<number | undefined>(undefined)
  const quickView = useQuickView()
  const { isSignedIn, points, addToCart } = shopper
  const total = product.price * quantity
  const shortage = isSignedIn ? Math.max(0, total - points) : 0
  const loginHref = `/login?next=${encodeURIComponent(`/products/${product.slug}`)}`

  useEffect(() => () => window.clearTimeout(addedTimer.current), [])

  // 포인트 부족 여부와 관계없이 담을 수 있다. 교환·차감은 장바구니에서 처리한다.
  const add = () => {
    addToCart(product, quantity)
    setAddedQuantity(quantity)
    window.clearTimeout(addedTimer.current)
    addedTimer.current = window.setTimeout(() => setAddedQuantity(null), 2400)
  }

  return (
    <main className="detail-page">
      <nav aria-label="현재 위치" className="breadcrumb page-shell">
        <Link href="/products">컬렉션</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/products?family=${product.family}`}>{product.family}</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{product.name}</span>
      </nav>
      <section className="detail-main page-shell">
        <div className={`detail-gallery tone-${product.accent}`}>
          <span className="gallery-caption">
            AURA {product.concentration.toUpperCase()} · {product.volume}
          </span>
          <ProductImage preload product={product} sizes="(max-width: 900px) 100vw, 57vw" />
          <span className="detail-image-name">{product.name}</span>
        </div>
        <div className="detail-info">
          <p className="product-family">
            {product.family} · {product.concentration} · {product.volume}
          </p>
          <h1>{product.name}</h1>
          <p className="detail-description">{product.description}</p>
          <p className="detail-story">{product.story}</p>
          <dl className="note-summary">
            {noteStages.map((stage) => (
              <div key={stage.key}>
                <dt>{stage.label}</dt>
                <dd>{product.notes[stage.key]}</dd>
              </div>
            ))}
          </dl>
          <div className="detail-price">
            <span>필요 포인트</span>
            <strong>{formatPoint(product.price)}</strong>
          </div>
          {isSignedIn ? (
            <div className="balance-line">
              <span>현재 보유 포인트</span>
              <strong>{formatPoint(points)}</strong>
            </div>
          ) : (
            <p className="balance-line detail-login-hint">
              <span>로그인하면 보유 포인트를 함께 확인할 수 있어요.</span>
              <Link href={loginHref}>로그인</Link>
            </p>
          )}
          {shortage > 0 && (
            <p className="detail-shortage">
              선택한 수량 기준 {formatPoint(shortage)}가 더 필요해요. 장바구니에는 먼저 담아 둘 수 있어요.
            </p>
          )}
          <div className="purchase-row">
            <ProductQuantity onChange={setQuantity} value={quantity} />
            <button className="primary-button" onClick={add} type="button">
              {added ? "장바구니에 담았어요" : "장바구니 담기"}
            </button>
          </div>
          <p aria-live="polite" className="detail-cart-status">
            {added && (
              <>
                {product.name} {addedQuantity}개를 담았어요. <Link href="/cart">장바구니 보기</Link>
              </>
            )}
          </p>
          <p className="policy-note">AURA 카드 회원 전용 · 100% 포인트 교환 상품</p>
          <div className="detail-accordions">
            <details open>
              <summary>
                교환 안내 <span aria-hidden="true">+</span>
              </summary>
              <p>
                장바구니에 담을 때는 포인트가 차감되지 않아요. 장바구니에서 교환 내용을 확인한 뒤, 로그인한
                계정의 AURA 포인트로 교환할 수 있어요.
              </p>
            </details>
            <details>
              <summary>
                패키징 디테일 <span aria-hidden="true">+</span>
              </summary>
              <p>재활용 가능한 종이 패키지와 유리 보틀, AURA 시그니처 태그로 구성됩니다.</p>
            </details>
          </div>
        </div>
      </section>

      <ScentNotes product={product} />
      <RelatedProducts onQuickView={quickView.open} product={product} />

      <div className="mobile-sticky-cta">
        <div>
          <span>{product.name}</span>
          <strong>
            {formatPoint(total)}
            {quantity > 1 && ` · ${quantity}개`}
          </strong>
        </div>
        <button onClick={add} type="button">
          {added ? "담았어요" : "장바구니 담기"}
        </button>
      </div>
      <QuickView onClose={quickView.close} product={quickView.product} />
    </main>
  )
}
