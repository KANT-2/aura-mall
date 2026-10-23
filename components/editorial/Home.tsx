"use client";
/* eslint-disable @next/next/no-img-element */
// Synchronize browser storage or URL state after hydration.
 
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  products,
  collections,
  Arrow,
  Asset,
  SectionHeading,
} from "./Shared";
import { useAura } from "./Provider";
import { ProductCard } from "./Commerce";

export function Home() {
  const { user } = useAura();
  const [promo, setPromo] = useState(0),
    [position, setPosition] = useState(0),
    [end, setEnd] = useState(false);
  const rail = useRef<HTMLDivElement>(null);
  const bestsellerIds = ["warm-eau-de-parfum", "fresh-hand-cream", "soft-perfume-oil", "warm-diffuser", "fresh-hand-wash", "soft-candle"];
  const bestsellers = bestsellerIds.map(id => products.find(p => p.id === id)).filter((p): p is (typeof products)[number] => Boolean(p));
  const promos = user
    ? [
        {
          title: "다시 만나는 나의 향",
          copy: "저장한 조합에서 새로운 취향을 이어가 보세요.",
          cta: "내가 만든 향",
          url: "/mypage",
          image: "/assets/products/soft-eau-de-parfum.webp",
        },
        {
          title: "취향을 담아 전하는 선물",
          copy: "같은 컬렉션에서 고른 세 가지 제품으로 마음을 전하세요.",
          cta: "선물 둘러보기",
          url: "/shop?type=gift-set",
          image: "/assets/products/warm-eau-de-parfum.webp",
        },
        {
          title: "좋아하는 향을 완성하는 시간",
          copy: "향료를 고르고 섞어, 나만의 향을 기록하세요.",
          cta: "향 만들기",
          url: "/atelier",
          image: "/assets/products/fresh-eau-de-parfum.webp",
        },
      ]
    : [
        {
          title: "AURA와의 첫 만남",
          copy: "회원가입하고 첫 주문에 사용할 배송비 쿠폰을 받아보세요.",
          cta: "회원가입하기",
          url: "/register",
          image: "/assets/products/soft-eau-de-parfum.webp",
        },
        {
          title: "좋아하는 향을 완성하는 시간",
          copy: "향료를 고르고 섞어, 나만의 향을 기록하세요.",
          cta: "향 만들기",
          url: "/atelier",
          image: "/assets/products/fresh-eau-de-parfum.webp",
        },
        {
          title: "취향을 담아 전하는 선물",
          copy: "같은 컬렉션에서 고른 세 가지 제품으로 마음을 전하세요.",
          cta: "선물 둘러보기",
          url: "/shop?type=gift-set",
          image: "/assets/products/warm-eau-de-parfum.webp",
        },
      ];
  const p = promos[promo % promos.length];
  useEffect(() => {
    const observer = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add("revealed");
        }),
      { threshold: 0.12 },
    );
    document.querySelectorAll(".reveal").forEach((e) => observer.observe(e));
    return () => {
      observer.disconnect();
    };
  }, []);
  return (
    <main className="home">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">THE SCENT VEIL — AURA</span>
          <h1>
            From Scent
            <br />
            <i>to Identity.</i>
          </h1>
          <h2>
            일상의 취향이,
            <br />
            나만의 향이 되다.
          </h2>
          <p>
            좋아하는 향을 발견하고,
            <br />
            나만의 향을 직접 완성해 보세요.
          </p>
          <div className="actions">
            <Link className="button" href="/shop">
              컬렉션 둘러보기 <Arrow />
            </Link>
            <Link className="text-link" href="/atelier">
              나만의 향 만들기 <Arrow />
            </Link>
          </div>
          <span className="hero-caption">01 — DISCOVER YOUR SCENT</span>
        </div>
        <div className="hero-image">
          <img
            src="/assets/products/warm-eau-de-parfum.webp"
            alt="우드와 자연 소재 사이에 놓인 AURA 향수"
          />
          <span>THE EVERYDAY SCENT / AURA</span>
        </div>
      </section>
      <section className="section collection-section reveal">
        <SectionHeading
          number="02"
          title="지금의 기분을 닮은 향"
          copy="맑게, 부드럽게, 따뜻하게. 세 가지 분위기에서 취향을 발견하세요."
        />
        <div className="collection-grid">
          {collections.map((c) => (
            <Link
              className="collection-card"
              key={c.id}
              href={"/shop?collection=" + c.id}
            >
              <div
                className="collection-circle"
                style={{ background: c.color }}
              >
                <Asset id={"collection-" + c.id} />
                <span className="collection-overlay">
                  {c.name}
                  <small>컬렉션 둘러보기 ↗</small>
                </span>
              </div>
              <span className="eyebrow">{c.name}</span>
              <h3>{c.title}</h3>
              <p>{c.description}</p>
            </Link>
          ))}
        </div>
      </section>
      <section
        className="promotion reveal"
        aria-roledescription="캐러셀"
        aria-label="AURA 소식"
      >
        <div className="promo-copy" key={p.title}>
          <span className="eyebrow">03 / AURA INVITATION</span>
          <h2>{p.title}</h2>
          <p>{p.copy}</p>
          <Link className="text-link" href={p.url}>
            {p.cta} <Arrow />
          </Link>
        </div>
        <div className="promo-visual" aria-hidden="true"><img key={p.image} className="a86-promo-photo" src={p.image} alt="" loading="lazy"/><span className="a86-promo-photo-caption">AURA / AN INVITATION TO SCENT</span></div>
        <div className="carousel-control">
          <button
            aria-label="이전 소식"
            onClick={() =>
              setPromo((promo + promos.length - 1) % promos.length)
            }
          >
            ←
          </button>
          <span aria-live="polite">
            0{promo + 1} / 0{promos.length}
          </span>
          <button
            aria-label="다음 소식"
            onClick={() => setPromo((promo + 1) % promos.length)}
          >
            →
          </button>
        </div>
      </section>
      <section className="section reveal">
        <div className="heading-row">
          <SectionHeading
            number="04"
            title="지금, 사랑받는 향"
            copy="한 가지 향에 머물지 않고, 다양한 제품으로 취향을 발견해 보세요."
          />
          <Link className="text-link" href="/shop">
            전체 보기 <Arrow />
          </Link>
        </div>
        <div
          className="product-rail"
          ref={rail}
          onScroll={() => {
            if (rail.current) {
              setPosition(rail.current.scrollLeft);
              setEnd(
                rail.current.scrollLeft + rail.current.clientWidth >=
                  rail.current.scrollWidth - 3,
              );
            }
          }}
        >
          {bestsellers.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
        <div className="rail-controls">
          <span>AURA SELECTED / 06</span>
          <button
            disabled={position < 1}
            aria-label="이전 상품"
            onClick={() =>
              rail.current?.scrollBy({ left: -380, behavior: "smooth" })
            }
          >
            ←
          </button>
          <button
            disabled={end}
            aria-label="다음 상품"
            onClick={() =>
              rail.current?.scrollBy({ left: 380, behavior: "smooth" })
            }
          >
            →
          </button>
        </div>
      </section>
      <section className="atelier-intro a86-atelier-intro">
        <div className="a86-atelier-intro-backdrop" aria-hidden="true"/>
        <div className="a86-atelier-intro-inner">
          <div className="a86-atelier-intro-main">
            <span className="eyebrow">05 / AURA PERSONAL ATELIER</span>
            <h2>당신만의 향을,<br/><i>천천히 완성해 보세요.</i></h2>
            <p>좋아하는 향료를 고르고, 한 방울씩 더한 뒤<br/>유리 막대로 직접 저어 나만의 향을 만들어 보세요.</p>
            <Link className="button light" href="/atelier">나만의 향 만들기 <Arrow /></Link>
          </div>
          <ol className="a86-atelier-steps">
            <li><strong>향료 선택</strong><span>좋아하는 노트를 골라요</span></li>
            <li><strong>천천히 조향</strong><span>한 방울씩 담고 저어요</span></li>
            <li><strong>나의 향 완성</strong><span>이름과 라벨을 기록해요</span></li>
          </ol>
        </div>
      </section>
      <section className="partner-intro section reveal">
<span className="eyebrow">06 / PARTNER WITH AURA</span>
        <h2>
          당신의 향을
          <br />
          <i>AURA에 소개해 주세요.</i>
        </h2>
        <p>
          자신만의 향과 이야기를 가진 브랜드를 기다립니다.
          <br />
          AURA와 함께 향의 경험을 넓혀가세요.
        </p>
        <Link className="text-link" href="/partner">
          입점 문의하기 <Arrow />
        </Link>
      </section>
    </main>
  );
}
