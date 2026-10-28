"use client";
import Link from "next/link";
import flow from "@/features/checkout/components/commerce-flow.module.css";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { request } from "@/lib/api/client";
import { type Order, orderStatusLabels } from "@/features/checkout/model/order";
import { useAccount } from "@/features/account/hooks/use-account";

export function OrderActions({ order }: { order: Order }) {
  const { user } = useAccount();
  const client = useQueryClient();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const cancel = async () => {
    if (
      !window.confirm(
        order.status === "received"
          ? "미결제 주문을 취소할까요?"
          : "이 주문의 전액 환불을 요청할까요?",
      )
    ) {
      return;
    }

    setPending(true);
    setMessage("");
    setFailed(false);
    try {
      const result = await request<Order>(`/orders/${encodeURIComponent(order.id)}/cancel`, {
        method: "POST",
        headers: { "X-Account-Owner": user?.id ?? "" },
      });
      setMessage(
        result.status === "cancelled"
          ? "주문을 취소했어요."
          : "환불 결과를 확인하고 있어요. 잠시 후 주문 상태를 다시 확인해 주세요.",
      );
      await Promise.all([
        client.invalidateQueries({ queryKey: ["orders"] }),
        client.invalidateQueries({ queryKey: ["account"] }),
        client.invalidateQueries({ queryKey: ["catalog"] }),
      ]);
    } catch (cause) {
      setFailed(true);
      void client.invalidateQueries({ queryKey: ["orders"] });
      setMessage(
        cause instanceof TypeError
          ? "처리 결과를 확인하지 못했어요. 잠시 후 주문 상태를 다시 확인해 주세요."
          : cause instanceof Error
            ? cause.message
            : "주문을 취소하지 못했어요.",
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <div className={flow.orderActions}>
      <div className={flow.orderActionRow}>
        {order.status && (
          <span className={flow.status} data-status={order.status}>
            {orderStatusLabels[order.status]}
          </span>
        )}
        <div className={flow.orderButtons}>
          {order.status === "received" && (
            <Link
              className={flow.compactPrimary}
              href={`/payments/${encodeURIComponent(order.id)}`}
            >
              결제 이어하기
            </Link>
          )}
          {order.status && ["received", "paid", "preparing"].includes(order.status) && (
            <button
              className={flow.compactSecondary}
              type="button"
              disabled={pending}
              onClick={() => void cancel()}
            >
              {pending
                ? "처리 중…"
                : order.status === "received"
                  ? "주문 취소"
                  : "취소·전액 환불 요청"}
            </button>
          )}
        </div>
      </div>
      {order.courier && (
        <p className={flow.tracking}>
          <span>배송 정보</span>
          <strong>{order.courier}</strong>
          <span>{order.trackingNumber}</span>
        </p>
      )}
      {message && (
        <p className={failed ? flow.error : flow.notice} role={failed ? "alert" : "status"}>
          {message}
        </p>
      )}
    </div>
  );
}
