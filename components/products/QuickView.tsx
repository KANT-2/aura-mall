"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { formatPoint } from "@/data/products"
import type { Product } from "@/types/product"
import { noteStages } from "./catalog"
import { ProductIcon } from "./ProductIcon"
import { ProductImage } from "./ProductImage"

/** 미리보기 상태와 실행 버튼(닫은 뒤 포커스 복귀용)을 함께 관리한다. */
export function useQuickView() {
  const [product, setProduct] = useState<Product | null>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  const open = useCallback((next: Product, trigger: HTMLElement) => {
    triggerRef.current = trigger
    setProduct(next)
  }, [])

  const close = useCallback(() => {
    setProduct(null)
    const trigger = triggerRef.current
    triggerRef.current = null
    if (trigger?.isConnected) trigger.focus()
  }, [])

  return { product, open, close }
}

/**
 * 네이티브 <dialog>의 showModal()을 사용한다.
 * 열린 동안 배경은 inert 처리되어 포커스가 빠지지 않고, Esc는 cancel → close 이벤트로 닫힌다.
 */
export function QuickView({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (product && !dialog.open) dialog.showModal()
    if (!product && dialog.open) dialog.close()
  }, [product])

  const requestClose = () => dialogRef.current?.close()

  return (
    <dialog
      aria-labelledby="quick-view-title"
      className="quick-view"
      onClick={(event) => {
        // 패널 바깥(::backdrop) 클릭 시 닫기
        if (event.target === event.currentTarget) requestClose()
      }}
      onClose={onClose}
      ref={dialogRef}
    >
      {product && (
        <div className="quick-view-panel">
          <button aria-label="미리보기 닫기" className="quick-view-close" onClick={requestClose} type="button">
            <ProductIcon name="close" />
          </button>
          <div className={`quick-view-visual tone-${product.accent}`}>
            <ProductImage product={product} sizes="(max-width: 560px) 100vw, 28rem" />
          </div>
          <div className="quick-view-body">
            <p className="product-family">
              {product.family} · {product.concentration} · {product.volume}
            </p>
            <h2 id="quick-view-title">{product.name}</h2>
            <p className="quick-view-description">{product.description}</p>
            <dl className="note-summary">
              {noteStages.map((stage) => (
                <div key={stage.key}>
                  <dt>{stage.label}</dt>
                  <dd>{product.notes[stage.key]}</dd>
                </div>
              ))}
            </dl>
            <div className="quick-view-price">
              <span>필요 포인트</span>
              <strong>{formatPoint(product.price)}</strong>
            </div>
            <Link className="cta-link" href={`/products/${product.slug}`} onClick={requestClose}>
              <span>상세 보기</span>
              <ProductIcon name="arrow" />
            </Link>
          </div>
        </div>
      )}
    </dialog>
  )
}
