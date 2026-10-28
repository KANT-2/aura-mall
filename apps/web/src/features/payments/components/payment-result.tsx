"use client";

import Link from "next/link";
import styles from "@/features/payments/components/payment.module.css";
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
  const done = payment?.status === "DONE";
  const checking = pending || payment?.status === "IN_PROGRESS";
  const title = done
    ? "주문이 완료되었어요"
    : checking
      ? "결제를 확인하고 있어요"
      : payment
        ? LABEL[payment.status]
        : "결제 결과 확인";
  return (
    <section className={styles.statePage}>
      <div className={styles.stateCard} aria-busy={pending}>
        <div
          className={`${styles.stateIcon} ${checking ? styles.pendingIcon : !done ? styles.failedIcon : ""}`}
          aria-hidden="true"
        >
          {checking ? <span className={styles.spinner} /> : done ? "✓" : "—"}
        </div>
        <span className={styles.eyebrow}>{done ? "THANK YOU FOR YOUR ORDER" : "AURA PAYMENT"}</span>
        <h1>{confirmation ? title : "결제 정보를 확인할 수 없어요"}</h1>
        <p>
          {done
            ? "선택하신 향을 주문 내역에 담아 두었어요. 주문과 배송 상태는 마이페이지에서 확인해 주세요."
            : checking
              ? "결제 결과를 안전하게 확인하고 있어요. 잠시 후 다시 확인해 주세요."
              : "주문 내역에서 현재 상태를 확인하고 결제를 이어갈 수 있어요."}
        </p>
        {payment && (
          <dl className={styles.resultDetails}>
            <div>
              <dt>상태</dt>
              <dd>
                <span className={styles.status} data-payment-status={payment.status}>
                  {LABEL[payment.status]}
                </span>
              </dd>
            </div>
            <div>
              <dt>주문 상품</dt>
              <dd>{payment.orderName}</dd>
            </div>
            {payment.method && (
              <div>
                <dt>결제수단</dt>
                <dd>{payment.method}</dd>
              </div>
            )}
            <div className={styles.resultAmount}>
              <dt>결제금액</dt>
              <dd>{payment.amount.toLocaleString("ko-KR")}원</dd>
            </div>
          </dl>
        )}
        {payment?.failureMessage && (
          <div className={styles.error} role="alert">
            {payment.failureMessage}
          </div>
        )}
        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}
        {(payment?.status === "IN_PROGRESS" || error) && confirmation && (
          <div className={styles.resultActions}>
            <button
              className={styles.secondary}
              type="button"
              disabled={pending}
              onClick={() => void confirm()}
            >
              {pending ? "확인 중…" : "결과 다시 확인"}
            </button>
          </div>
        )}
        <div className={styles.resultActions}>
          <Link className={styles.primary} href="/mypage?tab=orders">
            주문 내역으로 <span aria-hidden="true">↗</span>
          </Link>
          <Link className={styles.secondary} href="/shop">
            쇼핑 계속하기
          </Link>
        </div>
      </div>
    </section>
  );
}
