import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "결제 실패", robots: { index: false } };

/** Toss redirects here with code, message and orderId. Nothing is recorded as paid. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { code, message } = await searchParams;
  return (
    <section>
      <h1>결제가 완료되지 않았어요</h1>
      <p role="alert">
        {typeof message === "string" ? message : "결제를 진행하지 못했어요."}
        {typeof code === "string" ? ` (${code})` : ""}
      </p>
      <p>
        <Link href="/payments/test">다시 시도</Link>
      </p>
    </section>
  );
}
