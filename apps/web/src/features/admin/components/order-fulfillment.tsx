"use client";
import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { request } from "@/lib/api/client";
import { adminDate } from "@/features/admin/components/admin-feedback";
import type { AdminOrder } from "@/features/admin/model/admin";
import { orderStatusLabels, type OrderStatus } from "@/features/checkout/model/order";
import styles from "@/features/admin/components/admin.module.css";

const nextStatus: Partial<Record<OrderStatus, OrderStatus>> = {
  paid: "preparing",
  preparing: "shipped",
  shipped: "delivered",
};
const actorLabels: Record<string, string> = {
  member: "고객",
  admin: "관리자",
  system: "자동 처리",
};
function processingReason(reason: string) {
  if (reason.startsWith("payment ")) {
    return "결제 승인 확인";
  }

  if (reason === "member request") {
    return "고객의 주문 취소 요청";
  }

  if (reason === "unpaid order expired") {
    return "미결제 주문 자동 취소";
  }

  return reason;
}
const statusHelp: Partial<Record<OrderStatus, string>> = {
  received: "결제 확인 후 상품 준비를 시작할 수 있어요.",
  paid: "주문 정보를 확인하고 상품 준비를 시작해 주세요.",
  preparing: "상품을 발송한 뒤 택배사와 운송장 번호를 등록해 주세요.",
  shipped: "배송이 완료되었는지 확인한 뒤 완료 처리해 주세요.",
  delivered: "고객에게 배송이 완료된 주문이에요.",
  cancelled: "취소가 완료된 주문이에요.",
};

export function OrderFulfillment({ order }: { order: AdminOrder }) {
  const client = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const target = order.status ? nextStatus[order.status] : undefined;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) {
      return;
    }

    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      await request(`/admin/orders/${encodeURIComponent(order.id)}/fulfillment`, {
        method: "PATCH",
        body: JSON.stringify({
          expectedStatus: order.status,
          status: target,
          reason: String(form.get("reason")).trim(),
          courier: String(form.get("courier") ?? "").trim(),
          trackingNumber: String(form.get("trackingNumber") ?? "").trim(),
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
    <section
      className={styles.panel + " " + styles.fulfillmentPanel}
      aria-labelledby="order-processing-title"
    >
      <div className={styles.panelHeading}>
        <h2 id="order-processing-title">주문 처리</h2>
        <span className={styles.badge} data-status={order.status}>
          {order.status ? orderStatusLabels[order.status] : "확인 필요"}
        </span>
      </div>
      <p className={styles.help}>
        {order.status ? statusHelp[order.status] : "주문 상태를 다시 확인해 주세요."}
      </p>
      {order.courier && (
        <dl className={styles.trackingCard}>
          <div>
            <dt>택배사</dt>
            <dd>{order.courier}</dd>
          </div>
          <div>
            <dt>운송장 번호</dt>
            <dd>{order.trackingNumber}</dd>
          </div>
        </dl>
      )}
      {target && (
        <form className={styles.form} onSubmit={submit} aria-busy={pending}>
          <div className={styles.nextStep}>
            <span>다음 단계</span>
            <strong>{orderStatusLabels[target]}</strong>
          </div>
          <div className={styles.fields}>
            {target === "shipped" && (
              <>
                <label>
                  <span>택배사</span>
                  <input name="courier" required maxLength={100} placeholder="예: CJ대한통운" />
                </label>
                <label>
                  <span>운송장 번호</span>
                  <input
                    name="trackingNumber"
                    required
                    maxLength={100}
                    placeholder="운송장 번호 입력"
                  />
                </label>
              </>
            )}
            <label className={styles.wide}>
              <span>처리 사유</span>
              <input
                name="reason"
                required
                maxLength={200}
                placeholder={
                  target === "preparing"
                    ? "예: 결제 확인 후 포장 시작"
                    : target === "shipped"
                      ? "예: 택배사 인계 완료"
                      : "예: 배송 완료 확인"
                }
              />
            </label>
          </div>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <button className="button" disabled={pending}>
            {pending ? "처리 중…" : `${orderStatusLabels[target]} 처리`}
          </button>
        </form>
      )}
      <div className={styles.timelineSection}>
        <div className={styles.sectionDivider}>
          <h3>처리 이력</h3>
        </div>
        {order.statusHistory?.length ? (
          <ol className={styles.orderTimeline}>
            {order.statusHistory.map((entry, index) => (
              <li key={`${entry.changed}-${index}`}>
                <span className={styles.timelineDot} aria-hidden="true" />
                <div>
                  <div className={styles.timelineTop}>
                    <strong>
                      {orderStatusLabels[entry.status as OrderStatus] ?? entry.status}
                    </strong>
                    <span>{actorLabels[entry.actorType] ?? "처리 담당자"}</span>
                  </div>
                  <time dateTime={entry.changed}>{adminDate(entry.changed)}</time>
                  {entry.reason && <p>{processingReason(entry.reason)}</p>}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.help}>등록된 처리 이력이 없어요.</p>
        )}
      </div>
    </section>
  );
}
