"use client";
import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { request } from "@/lib/api/client";
import type { AdminOrder } from "@/features/admin/model/admin";
import { orderStatusLabels, type OrderStatus } from "@/features/checkout/model/order";
import styles from "@/features/admin/components/admin.module.css";

export function OrderFulfillment({ order }: { order: AdminOrder }) {
  const client = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const next: Partial<Record<OrderStatus, OrderStatus>> = {
    paid: "preparing",
    preparing: "shipped",
    shipped: "delivered",
  };
  const target = !order.isDemo && order.status ? next[order.status] : undefined;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      await request(`/admin/orders/${encodeURIComponent(order.id)}/fulfillment`, {
        method: "PATCH",
        body: JSON.stringify({
          expectedStatus: order.status,
          status: target,
          reason: form.get("reason"),
          courier: form.get("courier") ?? "",
          trackingNumber: form.get("trackingNumber") ?? "",
        }),
      });
      await client.invalidateQueries({ queryKey: ["admin"] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "상태를 변경하지 못했어요.");
    } finally {
      setPending(false);
    }
  };
  return (
    <section className={styles.panel}>
      <h2>주문 처리</h2>
      {order.isDemo && <p>시연용 기록 · 실제 결제·배송·재고와 분리된 조회용 데이터예요.</p>}
      <p>현재 상태: {order.status ? orderStatusLabels[order.status] : "확인 필요"}</p>
      {order.courier && (
        <p>
          배송: {order.courier} · {order.trackingNumber}
        </p>
      )}
      {target && (
        <form className={styles.form} onSubmit={submit}>
          {target === "shipped" && (
            <>
              <label>
                택배사
                <input name="courier" required maxLength={100} />
              </label>
              <label>
                운송장 번호
                <input name="trackingNumber" required maxLength={100} />
              </label>
            </>
          )}
          <label>
            처리 사유
            <input name="reason" required maxLength={200} />
          </label>
          <button className="button" disabled={pending}>
            {orderStatusLabels[target]} 처리
          </button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      <h3>처리 이력</h3>
      {order.statusHistory?.map((entry, index) => (
        <p key={index}>
          {new Date(entry.changed).toLocaleString("ko-KR")} ·{" "}
          {orderStatusLabels[entry.status as OrderStatus] ?? entry.status} · {entry.actorType}{" "}
          {entry.reason}
        </p>
      ))}
    </section>
  );
}
