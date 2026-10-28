"use client";
/* eslint-disable @next/next/no-img-element */
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useCatalog } from "@/features/catalog/hooks/use-catalog";
import { testIds } from "@/lib/test-ids";
import styles from "@/styles/commerce.module.css";
import flow from "@/features/checkout/components/commerce-flow.module.css";
import { Asset } from "@/components/ui/asset";
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
      setError(
        cause instanceof TypeError
          ? "연결이 잠시 끊겼어요. 입력한 내용을 유지한 채 다시 시도해 주세요."
          : cause instanceof Error
            ? cause.message
            : "주문을 접수하지 못했어요.",
      );
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
      <header className={flow.pageHeading}>
        <div>
          <span className="eyebrow">ORDER DETAILS</span>
          <h1>주문 정보</h1>
          <p>선택한 향을 확인하고 배송받을 곳을 알려 주세요.</p>
        </div>
        <ol className={flow.steps} aria-label="주문 진행 단계">
          <li className={flow.currentStep}>
            <span>01</span>배송 정보
          </li>
          <li>
            <span>02</span>결제
          </li>
          <li>
            <span>03</span>완료
          </li>
        </ol>
      </header>
      {!cart.length ? (
        <div className={flow.empty}>
          <Asset id="empty-bag" />
          <h2>장바구니가 비어 있어요.</h2>
          <p>마음에 드는 상품을 담은 뒤 주문을 시작해 보세요.</p>
          <Link className="button" href="/shop">
            컬렉션 보기 <span aria-hidden="true">↗</span>
          </Link>
        </div>
      ) : (
        <div className={flow.checkoutGrid}>
          <form
            id="checkout-details"
            className={flow.deliveryCard}
            onSubmit={submit}
            aria-busy={pending}
          >
            <div className={flow.sectionHeading}>
              <span>01 / DELIVERY</span>
              <h2>배송지</h2>
              <p>주문하신 상품을 안전하게 받을 수 있도록 정확히 입력해 주세요.</p>
            </div>
            {!user && (
              <p className={flow.notice}>로그인하면 배송지 입력과 결제를 진행할 수 있어요.</p>
            )}
            <fieldset className={flow.fieldGrid} disabled={pending || !user}>
              <label>
                받는 분
                <input
                  name="recipient"
                  maxLength={100}
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
              <label className={flow.fullField}>
                주소
                <input
                  name="address"
                  required
                  maxLength={350}
                  autoComplete="shipping street-address"
                  placeholder="도로명 또는 지번 주소"
                />
              </label>
              <label className={flow.fullField}>
                상세 주소
                <input
                  name="addressDetail"
                  maxLength={149}
                  autoComplete="shipping address-line2"
                  placeholder="동·호수 등 상세 주소"
                />
              </label>
              <label className={flow.fullField}>
                배송 요청사항
                <textarea
                  name="deliveryNote"
                  rows={3}
                  maxLength={300}
                  placeholder="예: 부재 시 문 앞에 놓아주세요."
                />
              </label>
            </fieldset>
            {user?.coupon && (
              <div className={flow.coupon}>
                <div>
                  <span className={flow.couponMark} aria-hidden="true">
                    A
                  </span>
                  <div>
                    <strong>첫 주문 배송비 쿠폰</strong>
                    <p>배송비 3,000원 혜택을 사용할 수 있어요.</p>
                  </div>
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={coupon}
                    disabled={pending}
                    onChange={(e) => setCoupon(e.target.checked)}
                  />
                  신규 회원 배송비 쿠폰 적용
                </label>
              </div>
            )}
            <div className={flow.formFootnote}>
              <span aria-hidden="true">✓</span>
              <p>배송 정보는 주문 처리와 배송 안내에 사용돼요.</p>
            </div>
          </form>
          <aside className={flow.summary} aria-label="주문 요약">
            <div className={flow.sectionHeading}>
              <span>YOUR SELECTION</span>
              <h2 data-testid={testIds.checkout.summary}>
                선택한 상품 <small>{cart.reduce((sum, item) => sum + item.quantity, 0)}개</small>
              </h2>
            </div>
            <ul className={flow.summaryItems}>
              {cart.map((x) => (
                <li key={x.key}>
                  <div className={flow.itemImage}>
                    <img src={x.product.image} alt="" />
                  </div>
                  <div>
                    <strong>{x.custom ? x.custom.name : x.product.name}</strong>
                    <p>
                      {x.custom ? "커스텀 향" : x.product.volume} · {x.quantity}개
                    </p>
                    {x.selection.length > 0 && (
                      <small>
                        {x.selection
                          .map((id) => products.find((p) => p.id === id)?.typeName)
                          .join(" · ")}
                      </small>
                    )}
                    <span>
                      {known ? money((itemPrice(x, products) ?? 0) * x.quantity) : "가격 확인 필요"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <dl className={flow.summaryAmounts} aria-live="polite">
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
              <div className={flow.summaryTotal}>
                <dt>합계</dt>
                <dd>
                  {known
                    ? money(total + shippingFee(total, Boolean(user?.coupon && coupon)))
                    : "가격 확인 필요"}
                </dd>
              </div>
            </dl>
            {!known && (
              <p className={flow.error}>
                가격 확인이 필요한 상품이 있어요.{" "}
                <Link href="/cart">장바구니에서 상품을 확인해 주세요.</Link>
              </p>
            )}
            {user ? (
              <button
                className={flow.primary}
                form="checkout-details"
                type="submit"
                disabled={pending || !known}
              >
                {pending ? "주문 접수 중…" : "주문하고 테스트 결제하기"}
                <span aria-hidden="true">→</span>
              </button>
            ) : (
              <Link className={flow.primary} href="/login?next=/checkout">
                로그인 후 주문하기 <span aria-hidden="true">→</span>
              </Link>
            )}
            {error && (
              <div className={flow.error} role="alert">
                {error}
              </div>
            )}
            <div className={flow.testNotice}>
              <strong>테스트 결제 안내</strong>
              <p>
                현재 테스트 환경으로 실제 금액이 청구되지 않아요. 주문 접수 후 확정한 금액으로
                결제를 이어가요.
              </p>
            </div>
            <p className={flow.finePrint}>
              미결제 주문은 10분 후 취소될 수 있어요. 커스텀 향의 실제 제조는 별도 확인이 필요해요.
            </p>
          </aside>
        </div>
      )}
    </main>
  );
}
