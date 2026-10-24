import Link from "next/link";
import { AuraWordmark } from "./AuraWordmark";

export function Footer() {
  return (
      <footer>
        <div>
          <Link className="logo aura-brand-link aura-footer-brand" href="/" aria-label="AURA 홈">
            <AuraWordmark className="aura-brand-mark" />
          </Link>
          <p>
            향으로 발견하는, 당신의 취향.
            <br />
            From Scent to Identity.
          </p>
        </div>
        <div>
          <span className="eyebrow">DISCOVER</span>
          <Link href="/shop">컬렉션</Link>
          <Link href="/atelier">나만의 향 만들기</Link>
          <Link href="/shop?type=gift-set">향의 선물</Link>
        </div>
        <div>
          <span className="eyebrow">YOUR AURA</span>
          <Link href="/mypage">마이페이지</Link>
          <Link href="/cart">장바구니</Link>
          <Link href="/partner">브랜드 입점 문의</Link>
        </div>
        <div className="footer-bottom">
          © 2026 AURA. From Scent to Identity.
        </div>
      </footer>
  );
}
