"use client";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useCatalog } from "@/features/catalog/hooks/use-catalog";
import { testIds } from "@/lib/test-ids";
import styles from "@/styles/commerce.module.css";
import Link from "next/link";
import { useState } from "react";

import { money } from "@/lib/format";
import { itemPrice, shippingFee } from "@/features/cart/model/pricing";
import { useCart } from "@/features/cart/hooks/use-cart";
import { useAccount } from "@/features/account/hooks/use-account";

export function Checkout() {
  const { products } = useCatalog();
  const { cart, ready } = useCart(),
    { user } = useAccount(),
    [coupon, setCoupon] = useState(false);
  const known = cart.every((x) => itemPrice(x, products) !== null),
    total = cart.reduce((sum, x) => sum + (itemPrice(x, products) ?? 0) * x.quantity, 0);
  if (!ready) {
    return (
      <main className={styles.root + " page-width checkout"} aria-busy="true">
        <LoadingSkeleton variant="checkout" label="주문 정보를 불러오고 있어요." />
      </main>
    );
  }

  return (
    <main className={styles.root + " page-width checkout"}>
      <span className="eyebrow">ORDER DETAILS</span>
      <h1>주문 정보</h1>
      {!cart.length ? (
        <div className="empty">
          <p>장바구니에서 상품을 선택해 주세요.</p>
          <Link className="button" href="/shop">
            컬렉션 보기
          </Link>
        </div>
      ) : (
        <div className="cart-layout">
          <form>
            <h2>배송지</h2>
            <label>
              받는 분
              <input
                name="recipient"
                autoComplete="shipping name"
                required
                placeholder="받는 분 이름"
              />
            </label>
            <label>
              연락처
              <input type="tel" autoComplete="shipping tel" placeholder="010-0000-0000" />
            </label>
            <label>
              주소
              <input autoComplete="shipping street-address" placeholder="배송받을 주소" />
            </label>
            <label>
              상세 주소
              <input placeholder="동·호수 등 상세 주소" />
            </label>
            <label>
              배송 요청사항
              <textarea placeholder="배송 시 요청사항을 적어주세요." />
            </label>
            {user?.coupon && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={coupon}
                  onChange={(e) => setCoupon(e.target.checked)}
                />
                신규 회원 배송비 쿠폰 적용
              </label>
            )}
          </form>
          <aside className="order-summary">
            <h2 data-testid={testIds.checkout.summary}>선택한 상품</h2>
            {cart.map((x) => (
              <p key={x.key}>
                {x.custom ? `${x.custom.name} (커스텀 향)` : x.product.name} × {x.quantity}
                {x.selection.length > 0 && (
                  <small>
                    {x.selection
                      .map((id) => products.find((p) => p.id === id)?.typeName)
                      .join(" · ")}
                  </small>
                )}
              </p>
            ))}
            <dl>
              <div>
                <dt>상품금액</dt>
                <dd>{known ? money(total) : "가격 확인 필요"}</dd>
              </div>
              <div>
                <dt>배송비</dt>
                <dd>
                  {known
                    ? shippingFee(total, Boolean(user?.coupon && coupon)) === 0
                      ? "무료"
                      : "3,000원"
                    : "금액 확인 필요"}
                </dd>
              </div>
              <div className="total">
                <dt>합계</dt>
                <dd>
                  {known
                    ? money(total + shippingFee(total, Boolean(user?.coupon && coupon)))
                    : "가격 확인 필요"}
                </dd>
              </div>
            </dl>
            <button className="button" disabled>
              결제 준비 중
            </button>
            <p className="micro">
              현재 주문 접수·결제는 지원되지 않아요. 커스텀 향은 제조 가능 여부 및 제작 정책 확인이
              필요해요.
            </p>
          </aside>
        </div>
      )}
    </main>
  );
}
