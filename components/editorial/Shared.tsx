"use client";
/* eslint-disable @next/next/no-img-element */
import catalog from "./catalog.json";
import { Vessel } from "../ui/Vessel";
import ingredients from "./ingredients.json";
import { AuraWordmark } from "./AuraWordmark";

export const { products, collections, types } = catalog;

export type Product = (typeof products)[number];

export const money = (v: number | null) =>
  v === null ? "가격 확인 중" : v.toLocaleString("ko-KR") + "원";

// Production assets are genuine small, layered vectors. Pixel-traced references are archived only.
// A single map prevents a page from accidentally mixing two illustration families.
const assetAliases:Record<string,string> = {"gold-droplet":"droplet"};
const botanicalNames = new Set([
  "bergamot","lemon","mandarin","grapefruit","peppermint","rosemary","apple","peach",
  "rose","jasmine","neroli","lavender","ylang","muguet","pink-pepper","cardamom",
  "sandalwood","cedarwood","vetiver","white-musk","amber","vanilla","benzoin","tonka"
]);
export const asset=(id:string)=> botanicalNames.has(id)
  ? `/assets/botanical/${id}.webp`
  : `/assets/editorial/${assetAliases[id]||id}.svg`;


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
  return <img className={className} src={asset(id)} alt="" draggable={false} />;
}

export function ProductPhoto({
  product: p,
  loading = "lazy",
}: {
  product: Product;
  loading?: "lazy" | "eager";
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
        {["hand-cream", "eau-de-parfum", "candle"].map((t) => (
          <img
            key={t}
            src={"/assets/products/" + p.collection + "-" + t + ".webp"}
            alt=""
            loading={loading}
          />
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
        disabled={n >= 15}
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
}: {
  count: number;
  color: string;
  mixing?: boolean;
  drop?: number;
}) {
  return <div className={"beaker " + (mixing ? "mixing" : "") }>
    <Vessel total={count} color={color} mixing={mixing} />
    {drop > 0 && <span key={drop} className="vessel-drop" style={{background:color}} aria-hidden="true" />}
  </div>;
}

export const totalCount = (counts: Record<string, number>) =>
  Object.values(counts).reduce((a, b) => a + b, 0);

export function mixColor(counts: Record<string, number>) {
  const total = totalCount(counts);
  if (!total) return "#d5b575";
  const sum = [0, 0, 0];
  ingredients.forEach((i) => {
    const n = counts[i.id] || 0;
    for (let c = 0; c < 3; c++)
      sum[c] += parseInt(i.color.slice(1 + c * 2, 3 + c * 2), 16) * n;
  });
  return (
    "#" +
    sum
      .map((v) =>
        Math.round(v / total)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
