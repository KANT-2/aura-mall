"use client";
export default function GlobalError() {
  return (
    <html lang="ko">
      <body>
        <h1>서비스에 연결하지 못했어요.</h1>
        <p>잠시 후 다시 시도해 주세요.</p>
        <button onClick={() => window.location.reload()}>다시 시도</button>
      </body>
    </html>
  );
}
