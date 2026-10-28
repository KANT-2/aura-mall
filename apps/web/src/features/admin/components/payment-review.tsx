"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { request } from "@/lib/api/client";
import {
  AdminEmpty,
  AdminError,
  AdminHeading,
  AdminLoading,
  AdminPagination,
  adminDate,
} from "@/features/admin/components/admin-feedback";
import type { AdminPage } from "@/features/admin/model/admin";
import { orderStatusLabels, type OrderStatus } from "@/features/checkout/model/order";
import { money } from "@/lib/format";
import styles from "@/features/admin/components/admin.module.css";

type Review = {
  id: string;
  orderId: string;
  status: string;
  orderStatus: OrderStatus;
  amount: number;
  unresolved: boolean;
  reviewReason: string | null;
  failureMessage: string | null;
  updated: string;
};
const paymentLabels: Record<string, string> = {
  READY: "결제 대기",
  IN_PROGRESS: "결과 확인 중",
  DONE: "결제 완료",
  FAILED: "결제 실패",
  CANCELED: "결제 취소",
};
const refundLabels: Record<string, string> = {
  IN_PROGRESS: "환불 확인 중",
  DONE: "환불 완료",
  FAILED: "환불 실패",
};
const reasons: Record<string, string> = {
  PG_RESULT_MISMATCH: "결제 결과와 주문 정보를 확인해 주세요.",
  PG_AMOUNT_MISMATCH: "결제 금액과 주문 금액이 일치하지 않아요.",
  REFUND_AMOUNT_MISMATCH: "환불 금액을 확인해 주세요.",
  PAYMENT_CANCELED_AT_PG: "결제 취소 상태를 확인해 주세요.",
};

export function PaymentReview() {
  const [kind, setKind] = useState("payments");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["admin", "payment-review", kind, page],
    queryFn: ({ signal }) =>
      request<AdminPage<Review>>(`/admin/${kind}/review?page=${page}`, { signal }),
    refetchInterval: 30000,
  });
  const refund = kind === "refunds";
  const labels = refund ? refundLabels : paymentLabels;
  return (
    <>
      <AdminHeading
        title="결제·환불 확인"
        description="처리 결과나 금액 확인이 필요한 내역을 확인해요."
      >
        <button
          className={styles.secondaryButton}
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? "확인 중…" : "새로고침"}
        </button>
      </AdminHeading>
      <div className={styles.reviewToolbar}>
        <div className={styles.tabs} aria-label="확인할 내역 선택">
          <button
            onClick={() => {
              setKind("payments");
              setPage(1);
            }}
            aria-pressed={!refund}
          >
            결제
          </button>
          <button
            onClick={() => {
              setKind("refunds");
              setPage(1);
            }}
            aria-pressed={refund}
          >
            환불
          </button>
        </div>
        {query.data && (
          <p className={styles.count} role="status">
            확인할 {refund ? "환불" : "결제"} <strong>{query.data.total}건</strong>
          </p>
        )}
      </div>
      <div className={styles.notice}>
        <span className={styles.noticeMark} aria-hidden="true">
          i
        </span>
        <p>
          응답이 늦어진 내역은 자동으로 다시 확인해요. 금액이나 상태가 일치하지 않는 내역은 주문
          상세에서 함께 확인해 주세요.
        </p>
      </div>
      {query.isLoading && <AdminLoading rows={4} />}
      {query.error && <AdminError error={query.error} retry={() => void query.refetch()} />}
      {query.data && !query.data.items.length && (
        <AdminEmpty title={`확인이 필요한 ${refund ? "환불" : "결제"}가 없어요.`}>
          추가 확인이 필요한 내역이 생기면 이곳에 표시돼요.
        </AdminEmpty>
      )}
      <div className={styles.reviewList} aria-busy={query.isFetching}>
        {query.data?.items.map((item) => (
          <article className={styles.reviewCard} key={item.id}>
            <div className={styles.reviewCardTop}>
              <div>
                <span className={styles.eyebrow}>
                  {refund ? "REFUND REVIEW" : "PAYMENT REVIEW"}
                </span>
                <h2>
                  <Link href={`/admin/orders/${encodeURIComponent(item.orderId)}`}>
                    주문 {item.orderId.slice(0, 8)} <span aria-hidden="true">↗</span>
                  </Link>
                </h2>
              </div>
              <span
                className={styles.badge}
                data-status={item.unresolved ? "received" : "reviewing"}
              >
                {item.unresolved ? "결과 확인 중" : "확인 필요"}
              </span>
            </div>
            <dl className={styles.reviewMetrics}>
              <div>
                <dt>{refund ? "환불 금액" : "결제 금액"}</dt>
                <dd>{money(item.amount)}</dd>
              </div>
              <div>
                <dt>{refund ? "환불 상태" : "결제 상태"}</dt>
                <dd>{labels[item.status] ?? item.status}</dd>
              </div>
              <div>
                <dt>주문 상태</dt>
                <dd>{orderStatusLabels[item.orderStatus] ?? "확인 필요"}</dd>
              </div>
            </dl>
            <div className={styles.reviewReason}>
              <strong>
                {item.unresolved
                  ? "처리 결과를 확인하고 있어요."
                  : (reasons[item.reviewReason ?? ""] ?? "주문과 처리 내역을 함께 확인해 주세요.")}
              </strong>
              {item.failureMessage && <p>{item.failureMessage}</p>}
              {item.reviewReason && !reasons[item.reviewReason] && (
                <small>확인 코드: {item.reviewReason}</small>
              )}
            </div>
            <footer className={styles.reviewFooter}>
              <span>
                최근 변경 <time dateTime={item.updated}>{adminDate(item.updated)}</time>
              </span>
              <Link href={`/admin/orders/${encodeURIComponent(item.orderId)}`}>
                주문 상세 보기 <span aria-hidden="true">→</span>
              </Link>
            </footer>
          </article>
        ))}
      </div>
      {query.data && query.data.total > query.data.pageSize && (
        <AdminPagination
          page={page}
          pageSize={query.data.pageSize}
          total={query.data.total}
          onPage={setPage}
        />
      )}
    </>
  );
}
