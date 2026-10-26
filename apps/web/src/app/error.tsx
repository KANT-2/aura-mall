"use client";
import { useQueryErrorResetBoundary } from "@tanstack/react-query";
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const { reset: resetQueries } = useQueryErrorResetBoundary();
  return (
    <main className="page-width empty">
      <h1>정보를 불러오지 못했어요.</h1>
      <p>잠시 후 다시 시도해 주세요.</p>
      <button
        className="button"
        onClick={() => {
          resetQueries();
          reset();
        }}
      >
        다시 시도
      </button>
    </main>
  );
}
