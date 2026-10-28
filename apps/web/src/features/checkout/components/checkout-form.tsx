"use client";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useCatalog } from "@/features/catalog/hooks/use-catalog";
import { testIds } from "@/lib/test-ids";
import styles from "@/styles/commerce.module.css";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { request } from "@/lib/api/client";
import type { Order } from "@/features/checkout/model/order";
import { checkoutKey, rememberCheckout } from "@/features/checkout/storage/checkout-attempt";

import { money } from "@/lib/format";
import { itemPrice, shippingFee } from "@/features/cart/model/pricing";
import { useCart } from "@/features/cart/hooks/use-cart";
import { useAccount } from "@/features/account/hooks/use-account";

export function Checkout() {
  const router = useRouter();
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const { products } = useCatalog();
  const { cart, ready } = useCart(),
    { user } = useAccount(),
    [coupon, setCoupon] = useState(false);
  const known = cart.every((x) => itemPrice(x, products) !== null),
    total = cart.reduce((sum, x) => sum + (itemPrice(x, products) ?? 0) * x.quantity, 0);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || submitting.current) {
      return;
    }

    const form = new FormData(event.currentTarget);
    const body = {
      recipient: form.get("recipient"),
      recipientPhone: form.get("recipientPhone"),
      address: [form.get("address"), form.get("addressDetail")].filter(Boolean).join(" "),
      deliveryNote: form.get("deliveryNote"),
      coupon: Boolean(user.coupon && coupon),
      items: cart.map((item) => ({
        quantity: item.quantity,
        selection: item.selection,
        ...(item.custom ? { custom: item.custom } : { productId: item.product.id }),
      })),
    };
    submitting.current = true;
    setPending(true);
    setError("");
    try {
      const key = await checkoutKey(user.id, body);
      const order = await request<Order>("/orders", {
        method: "POST",
        headers: { "Idempotency-Key": key, "X-Account-Owner": user.id },
        body: JSON.stringify(body),
      });
      rememberCheckout(order.id, user.id, cart);
      router.push(`/payments/${encodeURIComponent(order.id)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "주문을 접수하지 못했어요.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };
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
          <form id="checkout-details" onSubmit={submit}>
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
              <input
                name="recipientPhone"
                type="tel"
                maxLength={30}
                required
                autoComplete="shipping tel"
                placeholder="010-0000-0000"
              />
            </label>
            <label>
              주소
              <input
                name="address"
                required
                maxLength={350}
                autoComplete="shipping street-address"
                placeholder="배송받을 주소"
              />
            </label>
            <label>
              상세 주소
              <input name="addressDetail" maxLength={149} placeholder="동·호수 등 상세 주소" />
            </label>
            <label>
              배송 요청사항
              <textarea
                name="deliveryNote"
                maxLength={300}
                placeholder="배송 시 요청사항을 적어주세요."
              />
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
            {user ? (
              <button
                className="button"
                form="checkout-details"
                type="submit"
                disabled={pending || !known}
              >
                {pending ? "주문 접수 중…" : "주문하고 테스트 결제하기"}
              </button>
            ) : (
              <Link className="button" href="/login?next=/checkout">
                로그인 후 주문하기
              </Link>
            )}
            {error && <p role="alert">{error}</p>}
            <p className="micro">
              토스 테스트 결제로 실제 금액은 청구되지 않아요. 주문 접수 후 서버에서 확정한 금액으로
              결제해요. 미결제 주문은 10분 후 취소될 수 있어요. 커스텀 향의 실제 제조는 별도 확인이
              필요해요.
            </p>
          </aside>
        </div>
      )}
    </main>
  );
}
