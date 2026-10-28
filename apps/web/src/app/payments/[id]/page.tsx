import type { Metadata } from "next";
import { TossTestPayment } from "@/features/payments/components/toss-test-payment";
export const metadata: Metadata = { title: "주문 결제", robots: { index: false } };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="page-width">
      <TossTestPayment orderId={(await params).id} />
    </main>
  );
}
