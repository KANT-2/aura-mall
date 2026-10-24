"use client";
 
// Synchronize browser storage or URL state after hydration.
/* eslint-disable react-hooks/set-state-in-effect */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Arrow, Asset } from "./Shared";
import { collections, types } from "@/lib/aura/catalog";
import { useCart, useSession } from "../providers/AuraContexts";
import { AuraWordmark } from "./AuraWordmark";
import { WelcomeJourney } from "./WelcomeJourney";

export function Shell({ children, footer }: { children: ReactNode; footer: ReactNode }) {
  const { user } = useSession(),
    { cart } = useCart(),
    path = usePathname();
  const [menu, setMenu] = useState(false),
    [collection, setCollection] = useState("fresh"),
    [search, setSearch] = useState(false),
    [query, setQuery] = useState("");
  const router = useRouter(),
    nav = useRef<HTMLElement>(null),
    menuPress = useRef<boolean | null>(null);
  useEffect(() => {
    setMenu(false);
    setSearch(false);
  }, [path]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(false);
        setSearch(false);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  const c = collections.find((x) => x.id === collection)!;
  return (
    <>
      <a className="skip" href="#main-content">
        본문 바로가기
      </a>
      <header className="header">
        <Link className="logo aura-brand-link" href="/" aria-label="AURA 홈">
          <AuraWordmark className="aura-brand-mark" />
          <span className="aura-brand-subline">FROM SCENT TO IDENTITY</span>
        </Link>
        <nav
          ref={nav}
          aria-label="주 메뉴"
          onMouseLeave={() => { if (matchMedia("(hover: hover)").matches) setMenu(false); }}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setMenu(false);
          }}
        >
          <button
            className={menu ? "nav active" : "nav"}
            aria-expanded={menu}
            aria-controls="collection-menu"
            onMouseEnter={() => { if (matchMedia("(hover: hover)").matches) setMenu(true); }}
            onPointerDown={() => { menuPress.current = menu; }}
            onPointerCancel={() => { menuPress.current = null; }}
            onFocus={(e) => { if (menuPress.current === null && e.currentTarget.matches(":focus-visible")) setMenu(true); }}
            onClick={(e) => { if (e.detail === 0 || matchMedia("(hover: hover)").matches) setMenu(true); else setMenu(!(menuPress.current ?? menu)); menuPress.current = null; }}
          >
            컬렉션
          </button>
          <Link className="nav" href="/atelier">
            향 만들기
          </Link>
          {menu && (
            <div id="collection-menu" className="mega">
              <div className="mega-visual" style={{ background: c.color }}>
                <Asset id={"collection-" + c.id} />
                <p>{c.description}</p>
              </div>
              <div>
                <span className="eyebrow">COLLECTION</span>
                {collections.map((x) => (
                  <Link
                    key={x.id}
                    className={collection === x.id ? "chosen" : ""}
                    onMouseEnter={() => setCollection(x.id)}
                    onFocus={() => setCollection(x.id)}
                    href={"/shop?collection=" + x.id}
                  >
                    {x.name} <Arrow />
                  </Link>
                ))}
                <Link href="/shop">모든 컬렉션</Link>
              </div>
              <div className="mega-types">
                <span className="eyebrow">CATEGORY</span>
                {types.map((t) => (
                  <Link
                    href={`/shop?collection=${collection}&type=${t.id}`}
                    key={t.id}
                  >
                    {t.name}
                    <span>{t.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </nav>
        <div className="utility flex items-center">
          <button onClick={() => setSearch(true)} aria-label="상품 검색">
            <Icon name="search" />
          </button>
          <Link
            href={user ? "/mypage" : "/login"}
            aria-label={user ? "마이페이지" : "로그인"}
          >
            <Icon name="user" />
          </Link>
          <Link
            href="/cart"
            aria-label={
              "장바구니 " + cart.reduce((s, x) => s + x.quantity, 0) + "개"
            }
          >
            <Icon name="bag" />
            <small>{cart.reduce((s, x) => s + x.quantity, 0)}</small>
          </Link>
        </div>
      </header>
      {search && (
        <div className="search-panel">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(false);
              router.push("/shop?q=" + encodeURIComponent(query));
            }}
          >
            <label htmlFor="site-search">어떤 향을 찾고 있나요?</label>
            <div>
              <input
                autoFocus
                id="site-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="상품명, 컬렉션, 제품 유형"
              />
              <button type="submit">검색</button>
              <button
                type="button"
                aria-label="검색 닫기"
                onClick={() => setSearch(false)}
              >
                ×
              </button>
            </div>
          </form>
        </div>
      )}
      <div id="main-content">{children}</div>
      <WelcomeJourney/>
      {footer}
    </>
  );
}

export function Icon({ name }: { name: string }) {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      {name === "search" ? (
        <>
          <circle cx="10" cy="10" r="6.5" />
          <path d="m15 15 6 6" />
        </>
      ) : name === "user" ? (
        <>
          <circle cx="12" cy="7" r="3.5" />
          <path d="M4 21v-3a8 8 0 0 1 16 0v3" />
        </>
      ) : (
        <>
          <path d="M5 8h14l1 13H4L5 8Z" />
          <path d="M8 9V6a4 4 0 0 1 8 0v3" />
        </>
      )}
    </svg>
  );
}
