"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "@/features/account/hooks/use-account";
import { startPayment } from "@/features/payments/api/payments";
import type { Payment } from "@/features/payments/model/payment";
import { request } from "@/lib/api/client";
import { orderStatusLabels, type Order } from "@/features/checkout/model/order";
import { useOrders } from "@/features/checkout/hooks/use-orders";
import styles from "@/features/payments/components/payment.module.css";

/** Public client key for the Toss test environment. Only test keys enable this page. */
const CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? "";
const TEST_CLIENT_KEY = /^test_g?ck_[A-Za-z0-9_-]{8,200}$/.test(CLIENT_KEY);
const SDK_URL = "https://js.tosspayments.com/v2/standard";
const TEST_ITEM = { productId: "fresh-hand-cream", quantity: 1 };

type Widgets = {
  setAmount(amount: { currency: "KRW"; value: number }): Promise<void>;
  renderPaymentMethods(params: { selector: string; variantKey?: string }): Promise<unknown>;
  renderAgreement(params: { selector: string; variantKey?: string }): Promise<unknown>;
  requestPayment(params: {
    orderId: string;
    orderName: string;
    successUrl: string;
    failUrl: string;
  }): Promise<void>;
};
type TossPaymentsFactory = ((clientKey: string) => {
  widgets(params: { customerKey: string }): Widgets;
}) & { ANONYMOUS: string };

declare global {
  interface Window {
    TossPayments?: TossPaymentsFactory;
  }
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "요청을 처리하지 못했어요.";
}

/** Test-only flow: place a small order, issue a payment, pay in the Toss test widget. */
export function TossTestPayment({ orderId }: { orderId?: string }) {
  const { user, ready } = useAccount();
  const existingOrders = useOrders(Boolean(orderId));
  const existingOrder = existingOrders.data?.find((order) => order.id === orderId);
  const quoteName = existingOrder
    ? (existingOrder.items[0]?.custom?.name ??
        existingOrder.items[0]?.product.name ??
        "AURA 주문") +
      (existingOrder.items.length > 1 ? ` 외 ${existingOrder.items.length - 1}건` : "")
    : undefined;
  const [sdkReady, setSdkReady] = useState(false);
  const [widgetReady, setWidgetReady] = useState(false);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const widgets = useRef<Widgets | null>(null);

  useEffect(() => {
    const factory = window.TossPayments;
    if (!sdkReady || !payment || !factory || widgets.current) {
      return;
    }

    const current = factory(CLIENT_KEY).widgets({ customerKey: factory.ANONYMOUS });
    widgets.current = current;
    void (async () => {
      try {
        // The widget shows the server's amount; the server checks it again on approval.
        await current.setAmount({ currency: "KRW", value: payment.amount });
        await Promise.all([
          current.renderPaymentMethods({ selector: "#payment-method", variantKey: "DEFAULT" }),
          current.renderAgreement({ selector: "#payment-agreement", variantKey: "AGREEMENT" }),
        ]);
        setWidgetReady(true);
      } catch (cause) {
        setError(message(cause));
      }
    })();
  }, [sdkReady, payment]);
  if (!TEST_CLIENT_KEY) {
    return (
      <section className={styles.statePage}>
        <div className={styles.stateCard}>
          <span className={styles.eyebrow}>AURA PAYMENT</span>
          <h1>결제를 준비하고 있어요</h1>
          <p>지금은 결제를 이용할 수 없어요. 주문 내역을 확인하거나 잠시 후 다시 방문해 주세요.</p>
          <div className={styles.resultActions}>
            <Link className={styles.primary} href="/mypage?tab=orders">
              주문 내역으로
            </Link>
            <Link className={styles.secondary} href="/shop">
              쇼핑 계속하기
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (!ready) {
    return (
      <section className={styles.page} aria-busy="true">
        <div className={styles.loading} role="status">
          <span className={styles.spinner} />
          주문 정보를 확인하고 있어요.
        </div>
      </section>
    );
  }

  if (!user) {
    return (
      <section className={styles.statePage}>
        <div className={styles.stateCard}>
          <span className={styles.eyebrow}>AURA PAYMENT</span>
          <h1>로그인 후 결제를 이어가세요</h1>
          <p>회원님의 주문과 결제 정보를 안전하게 확인할 수 있어요.</p>
          <div className={styles.resultActions}>
            <Link
              className={styles.primary}
              href={`/login?next=${encodeURIComponent(orderId ? `/payments/${orderId}` : "/payments/test")}`}
            >
              로그인
            </Link>
            <Link className={styles.secondary} href="/cart">
              장바구니로
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const begin = async () => {
    setPending(true);
    setError("");
    try {
      let target = orderId;
      if (!target) {
        const order = await request<Order>("/orders", {
          method: "POST",
          body: JSON.stringify({ recipient: "테스트", address: "테스트 주소", items: [TEST_ITEM] }),
        });
        target = order.id;
      }

      setPayment(await startPayment(target));
    } catch (cause) {
      setError(message(cause));
    } finally {
      setPending(false);
    }
  };

  const pay = async () => {
    if (!payment || !widgets.current) {
      return;
    }

    setError("");
    setPending(true);
    try {
      await widgets.current.requestPayment({
        orderId: payment.pgOrderId,
        orderName: payment.orderName,
        successUrl: `${window.location.origin}/payments/success`,
        failUrl: `${window.location.origin}/payments/fail`,
      });
    } catch (cause) {
      setError(message(cause));
    } finally {
      setPending(false);
    }
  };

  return (
    <section className={styles.page}>
      <Script
        src={SDK_URL}
        onReady={() => setSdkReady(true)}
        onError={() =>
          setError("결제 수단을 불러오지 못했어요. 연결 상태를 확인한 뒤 다시 시도해 주세요.")
        }
      />
      <header className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>SECURE PAYMENT</span>
          <h1>주문 결제</h1>
          <p>결제 수단을 선택하고 주문을 완료해 주세요.</p>
        </div>
        <Link href="/mypage?tab=orders" className={styles.back}>
          주문 내역으로 돌아가기 ↗
        </Link>
      </header>
      <div className={styles.layout}>
        <div className={styles.panel} aria-busy={pending}>
          <div className={styles.panelHeader}>
            <span className={styles.step} aria-hidden="true">
              02
            </span>
            <div>
              <h2>결제 수단</h2>
              <p>원하는 방법으로 안전하게 결제하세요.</p>
            </div>
          </div>
          {!payment && (
            <div className={styles.prepare}>
              <p>
                {orderId
                  ? "주문 금액을 확인한 뒤 이용 가능한 결제 수단을 불러올게요."
                  : "상품 주문을 생성한 뒤 토스 테스트 결제를 진행할 수 있어요."}
              </p>
              <button
                className={styles.primary}
                type="button"
                disabled={pending || !ready || !user}
                onClick={begin}
              >
                {pending
                  ? "결제 준비 중…"
                  : orderId
                    ? "이 주문 결제 준비"
                    : "테스트 주문 만들고 결제 준비"}
                <span aria-hidden="true">→</span>
              </button>
            </div>
          )}
          {payment && !widgetReady && !error && (
            <div className={styles.loading} role="status">
              <span className={styles.spinner} />
              결제 수단을 불러오고 있어요.
            </div>
          )}
          <div className={styles.widgets} hidden={!payment}>
            <div id="payment-method" />
            <div id="payment-agreement" />
          </div>
          {payment?.status === "READY" && (
            <button
              className={`${styles.primary} ${styles.payButton}`}
              type="button"
              disabled={!widgetReady || pending}
              onClick={pay}
            >
              {pending ? "결제창 연결 중…" : "테스트 결제하기"}
              <span aria-hidden="true">→</span>
            </button>
          )}
          {error && (
            <div className={styles.error} role="alert">
              <p>{error}</p>
              {payment && !widgetReady && (
                <button type="button" onClick={() => window.location.reload()}>
                  결제 화면 새로고침
                </button>
              )}
            </div>
          )}
        </div>
        <aside className={styles.summary}>
          <div className={styles.summaryLabel}>ORDER SUMMARY</div>
          <h2>{payment?.orderName ?? quoteName ?? "나의 선택, 나의 향"}</h2>
          {payment && (
            <span className={styles.badge}>
              {
                {
                  READY: "결제 대기",
                  IN_PROGRESS: "결제 확인 중",
                  DONE: "결제 완료",
                  FAILED: "결제 실패",
                  CANCELED: "결제 취소됨",
                }[payment.status]
              }
            </span>
          )}
          {!payment && existingOrder?.status && (
            <span className={styles.badge}>{orderStatusLabels[existingOrder.status]}</span>
          )}
          <div className={styles.total}>
            <span>최종 결제금액</span>
            <strong>
              {payment
                ? `${payment.amount.toLocaleString("ko-KR")}원`
                : existingOrder
                  ? `${existingOrder.total.toLocaleString("ko-KR")}원`
                  : orderId && existingOrders.isLoading
                    ? "금액 확인 중…"
                    : "금액 확인 예정"}
            </strong>
          </div>
          <div className={styles.testNotice}>
            <strong>테스트 결제 안내</strong>
            <p>테스트 환경으로 실제 금액이 청구되지 않아요.</p>
          </div>
          <p className={styles.finePrint}>
            결제 완료 후 주문 내역에서 진행 상태를 확인할 수 있어요. 결제를 중단해도 주문 내역에서
            이어갈 수 있어요.
          </p>
        </aside>
      </div>
    </section>
  );
}
