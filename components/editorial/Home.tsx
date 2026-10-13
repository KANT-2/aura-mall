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
  Beaker,
} from "./Shared";
import { useAura } from "./Provider";
import { ProductCard } from "./Commerce";

export function Home() {
  const { user } = useAura();
  const [promo, setPromo] = useState(0),
    [stage, setStage] = useState(0),
    [position, setPosition] = useState(0),
    [end, setEnd] = useState(false);
  const atelier = useRef<HTMLElement>(null),
    rail = useRef<HTMLDivElement>(null);
  const promos = user
    ? [
        {
          title: "다시 만나는 나의 향",
          copy: "저장한 조합에서 새로운 취향을 이어가 보세요.",
          cta: "내가 만든 향",
          url: "/mypage",
          asset: "custom-bottle",
        },
        {
          title: "취향을 담아 전하는 선물",
          copy: "같은 컬렉션에서 고른 세 가지 제품으로 마음을 전하세요.",
          cta: "선물 둘러보기",
          url: "/shop?type=gift-set",
          asset: "gift",
        },
        {
          title: "좋아하는 향을 완성하는 시간",
          copy: "향료를 고르고 섞어, 나만의 향을 기록하세요.",
          cta: "향 만들기",
          url: "/atelier",
          asset: "dropper",
        },
      ]
    : [
        {
          title: "AURA와의 첫 만남",
          copy: "회원가입하고 첫 주문에 사용할 배송비 쿠폰을 받아보세요.",
          cta: "회원가입하기",
          url: "/register",
          asset: "coupon",
        },
        {
          title: "좋아하는 향을 완성하는 시간",
          copy: "향료를 고르고 섞어, 나만의 향을 기록하세요.",
          cta: "향 만들기",
          url: "/atelier",
          asset: "dropper",
        },
        {
          title: "취향을 담아 전하는 선물",
          copy: "같은 컬렉션에서 고른 세 가지 제품으로 마음을 전하세요.",
          cta: "선물 둘러보기",
          url: "/shop?type=gift-set",
          asset: "gift",
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
    const onScroll = () => {
      if (!atelier.current) return;
      const b = atelier.current.getBoundingClientRect();
      setStage(
        Math.max(
          0,
          Math.min(
            3,
            Math.floor(
              ((window.innerHeight - b.top) / (window.innerHeight + b.height)) *
                5,
            ),
          ),
        ),
      );
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
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
        <div className="promo-visual" aria-hidden="true"><div className="promo-visual-inner"><span className="promo-visual-overline">AN INVITATION TO AURA</span><Asset id={p.asset} /><span className="promo-visual-caption">THE EVERYDAY SCENT / AURA</span></div></div>
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
            title="일상에 들이는 향"
            copy="AURA가 고른 컬렉션의 시작. 가까운 순간부터 만나보세요."
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
          {products
            .filter((p) => p.featured)
            .map((p) => (
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
      <section className={"atelier-intro stage-" + stage} ref={atelier}>
        <div className="intro-art">
          {stage === 3 ? (
            <Asset id="custom-bottle" />
          ) : (
            <>
              <Asset id="bergamot" className="floating one" />
              <Asset id="jasmine" className="floating two" />
              <Beaker
                count={stage * 6 + 1}
                color={stage < 2 ? "#d5b575" : "#c5985c"}
                mixing={stage === 2}
              />
            </>
          )}
          <span className="eyebrow">
            0{stage + 1} /{" "}
            {
              [
                "향을 고르고",
                "용기에 담고",
                "하나의 향으로",
                "당신의 향을 기록하세요",
              ][stage]
            }
          </span>
        </div>
        <div>
          <span className="eyebrow">05 / AURA PERSONAL ATELIER</span>
          <h2>
            보이지 않는 향을,
            <br />
            <i>나만의 것으로.</i>
          </h2>
          <p>
            좋아하는 향을 하나씩 고르고,
            <br />
            직접 섞어 나만의 향수를 완성해 보세요.
          </p>
          <ol>
            <li>향을 고르고</li>
            <li>용기에 담고</li>
            <li>하나의 향으로</li>
          </ol>
          <Link className="button light" href="/atelier">
            나만의 향 만들기 <Arrow />
          </Link>
        </div>
      </section>
      <section className="partner-intro section reveal">
        <div className="partner-accent" aria-hidden="true"><Asset id="paper-tag"/></div><span className="eyebrow">06 / PARTNER WITH AURA</span>
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
