/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { Arrow } from "@/components/ui/arrow";
import { Asset } from "@/components/ui/asset";
import { SectionHeading } from "@/components/ui/section-heading";
import { ProductCard } from "@/features/catalog/components/product-card";
import { getServerCatalog } from "@/features/catalog/api/server";
import { PromotionCarousel } from "@/app/_components/promotion-carousel";
import { ProductRail } from "@/app/_components/product-rail";
import { HomeReveal } from "@/app/_components/home-reveal";
import styles from "@/app/_components/home.module.css";

export async function Home() {
  const { products, collections, home } = await getServerCatalog();
  const bestsellerIds = home.bestsellerIds;
  const bestsellers = bestsellerIds
    .map((id) => products.find((product) => product.id === id))
    .filter((product): product is (typeof products)[number] => Boolean(product));
  return (
    <main className={styles.root + " home"}>
      <HomeReveal />
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
            <Link className="collection-card" key={c.id} href={"/shop?collection=" + c.id}>
              <div className="collection-circle" style={{ background: c.color }}>
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
      <PromotionCarousel />
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
        <ProductRail>
          {bestsellers.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </ProductRail>
      </section>
      <section className="atelier-intro a86-atelier-intro">
        <div className="a86-atelier-intro-backdrop" aria-hidden="true" />
        <div className="a86-atelier-intro-inner">
          <div className="a86-atelier-intro-main">
            <span className="eyebrow">05 / AURA PERSONAL ATELIER</span>
            <h2>
              당신만의 향을,
              <br />
              <i>천천히 완성해 보세요.</i>
            </h2>
            <p>
              좋아하는 향료를 고르고, 한 방울씩 더한 뒤<br />
              유리 막대로 직접 저어 나만의 향을 만들어 보세요.
            </p>
            <Link className="button light" href="/atelier">
              나만의 향 만들기 <Arrow />
            </Link>
          </div>
          <ol className="a86-atelier-steps">
            <li>
              <strong>향료 선택</strong>
              <span>좋아하는 노트를 골라요</span>
            </li>
            <li>
              <strong>천천히 조향</strong>
              <span>한 방울씩 담고 저어요</span>
            </li>
            <li>
              <strong>나의 향 완성</strong>
              <span>이름과 라벨을 기록해요</span>
            </li>
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
