"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { request } from "@/lib/api/client";
import { AdminError } from "@/features/admin/components/admin-feedback";
import type { AdminPage } from "@/features/admin/model/admin";
import { orderStatusLabels, type OrderStatus } from "@/features/checkout/model/order";
import { money } from "@/lib/format";
import styles from "@/features/admin/components/admin.module.css";
type Review = {
  isDemo?: boolean;
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
export function PaymentReview() {
  const [kind, setKind] = useState("payments");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["admin", "payment-review", kind, page],
    queryFn: ({ signal }) =>
      request<AdminPage<Review>>(`/admin/${kind}/review?page=${page}`, { signal }),
    refetchInterval: 30000,
  });
  return (
    <section>
      <h1>결제·환불 확인</h1>
      <p>
        결과 확인이 필요한 결제와 환불이에요. 자동 재확인은 원래 요청 식별자로 처리하며, 금액
        불일치는 완료로 강제 변경하지 않아요.
      </p>
      <div className="actions">
        <button
          onClick={() => {
            setKind("payments");
            setPage(1);
          }}
          aria-pressed={kind === "payments"}
        >
          결제
        </button>
        <button
          onClick={() => {
            setKind("refunds");
            setPage(1);
          }}
          aria-pressed={kind === "refunds"}
        >
          환불
        </button>
        <button onClick={() => void query.refetch()}>새로고침</button>
      </div>
      {query.isLoading && <p role="status">내역을 확인하고 있어요.</p>}
      {query.error && <AdminError error={query.error} retry={() => void query.refetch()} />}
      {query.data && !query.data.items.length && <p>확인이 필요한 내역이 없어요.</p>}
      {query.data?.items.map((item) => (
        <article className={styles.panel} key={item.id}>
          {item.isDemo && <p>시연용 기록 · PG 재확인 제외</p>}
          <h2>
            <Link href={`/admin/orders/${item.orderId}`}>주문 {item.orderId.slice(0, 8)}</Link>
          </h2>
          <p>
            {money(item.amount)} · {item.status} · 주문 {orderStatusLabels[item.orderStatus]}
          </p>
          <p>
            {item.unresolved ? "PG 응답 확인 중" : "운영자 확인 필요"} ·{" "}
            {item.reviewReason ?? "결과 미확정"}
          </p>
          {item.failureMessage && <p>{item.failureMessage}</p>}
          <small>{new Date(item.updated).toLocaleString("ko-KR")}</small>
        </article>
      ))}
      {query.data && (
        <nav aria-label="결제 확인 페이지">
          <button disabled={page === 1} onClick={() => setPage(page - 1)}>
            이전
          </button>
          <span>{page}</span>
          <button disabled={page * 20 >= query.data.total} onClick={() => setPage(page + 1)}>
            다음
          </button>
        </nav>
      )}
    </section>
  );
}
