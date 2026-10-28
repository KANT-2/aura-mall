import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/features/payments/components/payment.module.css";
export const metadata: Metadata = { title: "결제 확인", robots: { index: false } };

/** PG failure redirects do not complete or cancel the order. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { message } = await searchParams;
  const detail =
    typeof message === "string" && message.length <= 300
      ? message
      : "결제를 진행하지 못했어요. 결제 수단과 연결 상태를 확인해 주세요.";
  return (
    <section className={styles.statePage}>
      <div className={styles.stateCard}>
        <div className={`${styles.stateIcon} ${styles.failedIcon}`} aria-hidden="true">
          —
        </div>
        <span className={styles.eyebrow}>AURA PAYMENT</span>
        <h1>결제가 완료되지 않았어요</h1>
        <p>주문 내역에서 상태를 확인하고 결제를 다시 이어갈 수 있어요.</p>
        <div className={styles.error} role="alert">
          {detail}
        </div>
        <div className={styles.resultActions}>
          <Link href="/mypage?tab=orders" className={styles.primary}>
            주문 내역에서 다시 결제하기 <span aria-hidden="true">↗</span>
          </Link>
          <Link href="/cart" className={styles.secondary}>
            장바구니로
          </Link>
        </div>
      </div>
    </section>
  );
}
