"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useState } from "react";
import { useCatalog } from "@/features/catalog/hooks/use-catalog";
import { useCart } from "@/features/cart/hooks/use-cart";
import type { Order } from "@/features/checkout/model/order";
import { OrderActions } from "@/features/checkout/components/order-actions";
import { money } from "@/lib/format";
import flow from "@/features/checkout/components/commerce-flow.module.css";
export function OrderCard({ order }: { order: Order }) {
  const { addOrderItems } = useCart();
  const { products } = useCatalog();
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const lineTotal = (item: Order["items"][number]) => {
    const amount = item.unitPrice ?? item.product.price;
    return amount === null ? null : amount * item.quantity;
  };
  return (
    <article className={flow.orderCard}>
      <header className={flow.orderHeader}>
        <div>
          <time dateTime={order.created}>
            {new Date(order.created).toLocaleDateString("ko-KR")}
          </time>
          <span>주문번호 {order.id.slice(0, 8).toUpperCase()}</span>
        </div>
        <strong>{money(order.total)}</strong>
      </header>
      <ul className={flow.orderItems}>
        {order.items.map((item) => (
          <li key={item.key}>
            <div className={flow.orderItemImage}>
              <img src={item.product.image} alt="" loading="lazy" />
            </div>
            <div>
              <h3>{item.custom ? item.custom.name : item.product.name}</h3>
              <p>
                {item.custom ? "커스텀 향" : item.product.volume} · {item.quantity}개
              </p>
              {!item.custom && products.some((product) => product.id === item.product.id) && (
                <Link href={`/shop/${encodeURIComponent(item.product.id)}`}>
                  상품 보기 <span aria-hidden="true">↗</span>
                </Link>
              )}
            </div>
            <span>{money(lineTotal(item))}</span>
          </li>
        ))}
      </ul>
      <div className={flow.reorderRow}>
        <p>마음에 든 향을 다시 만나보세요.</p>
        <button
          className={flow.compactSecondary}
          type="button"
          disabled={adding}
          onClick={async () => {
            setAdding(true);
            try {
              setAdded(await addOrderItems(order.items));
            } finally {
              setAdding(false);
            }
          }}
        >
          {adding ? "담는 중…" : "같은 상품 다시 담기"}
        </button>
      </div>
      {added && (
        <p className={flow.notice} role="status">
          장바구니에 담았어요. <Link href="/cart">장바구니 보기 →</Link>
        </p>
      )}
      <OrderActions order={order} />
      <details className={flow.deliveryDetails}>
        <summary>배송지 정보</summary>
        <dl>
          <div>
            <dt>받는 분</dt>
            <dd>{order.recipient}</dd>
          </div>
          {order.recipientPhone && (
            <div>
              <dt>연락처</dt>
              <dd>{order.recipientPhone}</dd>
            </div>
          )}
          <div>
            <dt>주소</dt>
            <dd>{order.address}</dd>
          </div>
          {order.deliveryNote && (
            <div>
              <dt>배송 요청사항</dt>
              <dd>{order.deliveryNote}</dd>
            </div>
          )}
        </dl>
      </details>
    </article>
  );
}
