import Link from "next/link";

export function Missing() {
  return (
    <main className="page-width empty">
      <span className="eyebrow">PAGE NOT FOUND</span>
      <h1>이 페이지를 찾을 수 없어요.</h1>
      <Link className="button" href="/shop">
        컬렉션으로 이동
      </Link>
    </main>
  );
}
