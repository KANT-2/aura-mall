"use client";
import Link from "next/link";
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
      setMessage(cause instanceof Error ? cause.message : "주문을 취소하지 못했어요.");
    } finally {
      setPending(false);
    }
  };
  return (
    <div>
      {order.status && (
        <p>
          <strong>{orderStatusLabels[order.status]}</strong>
        </p>
      )}
      {order.courier && (
        <p>
          배송: {order.courier} · {order.trackingNumber}
        </p>
      )}
      {order.status === "received" && (
        <Link className="button" href={`/payments/${encodeURIComponent(order.id)}`}>
          결제 이어하기
        </Link>
      )}
      {order.status && ["received", "paid", "preparing"].includes(order.status) && (
        <button type="button" disabled={pending} onClick={() => void cancel()}>
          {order.status === "received" ? "주문 취소" : "취소·전액 환불 요청"}
        </button>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
