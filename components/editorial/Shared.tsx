"use client";
/* eslint-disable @next/next/no-img-element */
import { MAX_QUANTITY, products, type Product } from "../../lib/aura/catalog";
import { Vessel } from "../ui/Vessel";
import { AuraWordmark } from "./AuraWordmark";
import { AuraCollectionArtwork } from "./AuraCollectionArtwork";

// Botanical illustrations use transparent WebP; tools use layered SVG.
// Keep shared asset paths consistent across the selector, recipes, and account pages.
const assetAliases:Record<string,string> = {"gold-droplet":"droplet"};
const botanicalNames = new Set([
  "bergamot","lemon","mandarin","grapefruit","peppermint","rosemary","apple","peach",
  "rose","jasmine","neroli","lavender","ylang","muguet","pink-pepper","cardamom",
  "sandalwood","cedarwood","vetiver","white-musk","amber","vanilla","benzoin","tonka"
]);
export const asset=(id:string)=> {
  const resolved=assetAliases[id]||id;
  return botanicalNames.has(resolved) ? `/assets/botanical/${resolved}.webp` : `/assets/editorial/${resolved}.svg`;
};


export function Arrow() {
  return <span aria-hidden="true">↗</span>;
}

export function Asset({
  id,
  className = "",
}: {
  id: string;
  className?: string;
}) {
  if (id === "collection-fresh" || id === "collection-soft" || id === "collection-warm") {
    return <AuraCollectionArtwork collection={id.slice("collection-".length)} className={className} />;
  }
  return <img className={className} src={asset(id)} alt="" draggable={false} />;
}

export function ProductPhoto({
  product: p,
  loading = "lazy",
  selection = [],
}: {
  product: Product;
  loading?: "lazy" | "eager";
  selection?: string[];
}) {
  return p.type === "gift-set" ? (
    <div
      className="gift-photo"
      role="img"
      aria-label={p.name + " — 같은 컬렉션의 제품 3개 선택"}
    >
      <span className="gift-photo-brand">
        <AuraWordmark className="a-gift-brand-mark" /> <small>THE GIFT OF SCENT</small>
      </span>
      <div>
        {(selection.length === 3
          ? selection.map(id => products.find(item => item.id === id)?.image).filter((url): url is string => Boolean(url))
          : ["hand-cream", "eau-de-parfum", "candle"].map(t => "/assets/products/" + p.collection + "-" + t + ".webp")
        ).map((url, i) => (
          <img key={`${url}-${i}`} src={url} alt="" loading={loading} />
        ))}
      </div>
      <span>{p.collection.toUpperCase()} / YOUR THREE SELECTIONS</span>
    </div>
  ) : (
    <img src={p.image} alt={p.englishName} loading={loading} />
  );
}

export function SectionHeading({
  number,
  title,
  copy,
}: {
  number: string;
  title: string;
  copy: string;
}) {
  return (
    <div className="section-heading">
      <span className="eyebrow">{number} / AURA EDITORIAL</span>
      <h2>{title}</h2>
      <p>{copy}</p>
    </div>
  );
}

export function Quantity({ n, set }: { n: number; set: (n: number) => void }) {
  return (
    <div className="quantity">
      <button
        disabled={n <= 1}
        aria-label="수량 줄이기"
        onClick={() => set(n - 1)}
      >
        −
      </button>
      <output aria-live="polite">{n}</output>
      <button
        disabled={n >= MAX_QUANTITY}
        aria-label="수량 늘리기"
        onClick={() => set(n + 1)}
      >
        +
      </button>
    </div>
  );
}

export function Beaker({
  count,
  color,
  mixing = false,
  drop = 0,
  stir,
}: {
  count: number;
  color: string;
  mixing?: boolean;
  drop?: number;
  stir?: {x:number;y:number;energy:number;tilt?:number;wave?:number;mode?:string};
}) {
  return <div className={"beaker " + (mixing ? "mixing" : "") }>
    <Vessel total={count} color={color} mixing={mixing} stir={stir} />
    {drop > 0 && <span key={drop} className="vessel-drop a86-vessel-drop" aria-hidden="true"><img src="/assets/editorial/drop-amber-natural.svg" alt="" /></span>}
  </div>;
}
