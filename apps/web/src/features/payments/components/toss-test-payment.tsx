"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "@/features/account/hooks/use-account";
import { startPayment } from "@/features/payments/api/payments";
import type { Payment } from "@/features/payments/model/payment";
import { request } from "@/lib/api/client";
import type { Order } from "@/features/checkout/model/order";

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
      <section>
        <h1>토스페이먼츠 테스트 결제</h1>
        <p>테스트 클라이언트 키(NEXT_PUBLIC_TOSS_CLIENT_KEY, test_ 키)가 설정되지 않았어요.</p>
      </section>
    );
  }

  if (ready && !user) {
    return (
      <section>
        <h1>토스페이먼츠 테스트 결제</h1>
        <p>
          <Link href="/login">로그인</Link> 후 테스트 결제를 진행할 수 있어요.
        </p>
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
    <section>
      <Script src={SDK_URL} onReady={() => setSdkReady(true)} />
      <h1>토스페이먼츠 테스트 결제</h1>
      <p>테스트 환경 결제예요. 실제 금액이 청구되지 않아요.</p>
      {payment ? (
        <p>
          {payment.orderName} · {payment.amount.toLocaleString("ko-KR")}원 ({payment.status})
        </p>
      ) : (
        <button
          className="button"
          type="button"
          disabled={pending || !ready || !user}
          onClick={begin}
        >
          {orderId ? "이 주문 결제 준비" : "테스트 주문 만들고 결제 준비"}
        </button>
      )}
      <div id="payment-method" />
      <div id="payment-agreement" />
      {payment?.status === "READY" && (
        <button className="button" type="button" disabled={!widgetReady || pending} onClick={pay}>
          테스트 결제하기
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
