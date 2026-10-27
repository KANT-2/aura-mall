import type { Metadata } from "next";
import { TossTestPayment } from "@/features/payments/components/toss-test-payment";

export const metadata: Metadata = { title: "테스트 결제", robots: { index: false } };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { orderId } = await searchParams;
  return <TossTestPayment orderId={typeof orderId === "string" ? orderId : undefined} />;
}
