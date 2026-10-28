import type { Metadata } from "next";
import { PaymentResult } from "@/features/payments/components/payment-result";

export const metadata: Metadata = { title: "결제 결과", robots: { index: false } };

/** Toss redirects here with paymentType, amount, orderId and paymentKey. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { paymentKey, orderId, amount } = await searchParams;
  const value = typeof amount === "string" && /^[0-9]{1,9}$/.test(amount) ? Number(amount) : NaN;
  const confirmation =
    typeof paymentKey === "string" && typeof orderId === "string" && Number.isSafeInteger(value)
      ? { paymentKey, orderId, amount: value }
      : null;
  return <PaymentResult confirmation={confirmation} />;
}
