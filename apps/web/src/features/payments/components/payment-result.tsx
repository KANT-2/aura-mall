"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useCatalog } from "@/features/catalog/hooks/use-catalog";
import { completeCheckout } from "@/features/checkout/storage/checkout-attempt";
import { useEffect, useRef, useState } from "react";
import { confirmPayment } from "@/features/payments/api/payments";
import type { Payment, PaymentConfirmation } from "@/features/payments/model/payment";

const LABEL: Record<Payment["status"], string> = {
  READY: "결제 대기",
  IN_PROGRESS: "결제 확인 중",
  DONE: "결제 완료",
  FAILED: "결제 실패",
  CANCELED: "결제 취소됨",
};

/** Sends the PG success redirect to the server, which compares the amount and approves. */
export function PaymentResult({ confirmation }: { confirmation: PaymentConfirmation | null }) {
  const catalog = useCatalog();
  const client = useQueryClient();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const started = useRef(false);

  const confirm = async () => {
    if (!confirmation) {
      return;
    }

    setPending(true);
    setError("");
    try {
      // Sending the same values again is safe: the server and PG approve only once.
      const result = await confirmPayment(confirmation);
      if (result.status === "DONE") {
        await completeCheckout(result.orderId, catalog).catch(() => {});
        void client.invalidateQueries({ queryKey: ["orders"] });
        void client.invalidateQueries({ queryKey: ["account"] });
      }

      setPayment(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "결제를 확인하지 못했어요.");
    } finally {
      setPending(false);
    }
  };

  useEffect(() => {
    if (!started.current) {
      started.current = true;
      void confirm();
    }
    // Confirm once per page load; the retry button handles unknown results.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!confirmation) {
    return <p role="alert">결제 정보를 확인할 수 없어요.</p>;
  }

  return (
    <section>
      <h1>결제 결과</h1>
      {pending && <p role="status">결제를 확인하고 있어요.</p>}
      {payment && (
        <dl>
          <dt>상태</dt>
          <dd data-payment-status={payment.status}>{LABEL[payment.status]}</dd>
          <dt>주문</dt>
          <dd>{payment.orderName}</dd>
          <dt>금액</dt>
          <dd>{payment.amount.toLocaleString("ko-KR")}원</dd>
          {payment.method && (
            <>
              <dt>결제수단</dt>
              <dd>{payment.method}</dd>
            </>
          )}
          {payment.failureMessage && (
            <>
              <dt>사유</dt>
              <dd>{payment.failureMessage}</dd>
            </>
          )}
        </dl>
      )}
      {payment?.status === "IN_PROGRESS" && (
        <button className="button" type="button" disabled={pending} onClick={() => void confirm()}>
          결과 다시 확인
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      <p>
        <Link href="/mypage">주문 내역으로</Link>
      </p>
    </section>
  );
}
