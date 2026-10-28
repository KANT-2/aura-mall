"use client";
import { useCatalog } from "@/features/catalog/hooks/use-catalog";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRef, useState } from "react";
import { Arrow } from "@/components/ui/arrow";
import { useAccount } from "@/features/account/hooks/use-account";

export function PromotionCarousel() {
  const { user } = useAccount();
  const [promo, setPromo] = useState(0);
  const promoTouch = useRef<{ x: number; y: number } | null>(null);
  const { home } = useCatalog();
  const promos = user ? home.memberPromotions : home.guestPromotions;
  const p = promos[promo % promos.length];
  if (!p) {
    return null;
  }

  return (
    <section
      className="promotion reveal"
      aria-roledescription="캐러셀"
      aria-label="AURA 소식"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) {
          return;
        }

        if (event.key === "ArrowRight") {
          event.preventDefault();
          setPromo((i) => (i + 1) % promos.length);
        }

        if (event.key === "ArrowLeft") {
          event.preventDefault();
          setPromo((i) => (i + promos.length - 1) % promos.length);
        }
      }}
      onTouchStart={(event) => {
        const t = event.touches[0];
        promoTouch.current = { x: t.clientX, y: t.clientY };
      }}
      onTouchEnd={(event) => {
        const start = promoTouch.current;
        promoTouch.current = null;
        if (!start) {
          return;
        }

        const t = event.changedTouches[0];
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.2) {
          setPromo((i) => (i + (dx < 0 ? 1 : promos.length - 1)) % promos.length);
        }
      }}
    >
      <div className="promo-copy" key={p.title}>
        <span className="eyebrow">03 / AURA INVITATION</span>
        <h2>{p.title}</h2>
        <p>{p.copy}</p>
        <Link className="text-link" href={p.url}>
          {p.cta} <Arrow />
        </Link>
      </div>
      <div className="promo-visual" aria-hidden="true">
        <img key={p.image} className="a86-promo-photo" src={p.image} alt="" loading="lazy" />
        <span className="a86-promo-photo-caption">AURA / AN INVITATION TO SCENT</span>
      </div>
      <div className="carousel-control">
        <button
          aria-label="이전 소식"
          onClick={() => setPromo((promo + promos.length - 1) % promos.length)}
        >
          ←
        </button>
        <span aria-live="polite">
          0{promo + 1} / 0{promos.length}
        </span>
        <button aria-label="다음 소식" onClick={() => setPromo((promo + 1) % promos.length)}>
          →
        </button>
      </div>
    </section>
  );
}
