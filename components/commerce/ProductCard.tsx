import Link from "next/link";
import type { Product } from "@/lib/aura/catalog";
import { money } from "@/lib/aura/format";
import { ProductPhoto } from "../editorial/Shared";

export function ProductCard({ product: p }: { product: Product }) {
  return (
    <Link href={"/shop/" + p.id} className="product-card">
      <div className="product-image">
        <ProductPhoto product={p} />
        <span>자세히 보기 ↗</span>
      </div>
      <span className="eyebrow">{p.collection.toUpperCase()} COLLECTION</span>
      <h3>{p.name}</h3>
      <p>
        {p.typeName} · {p.volume}
      </p>
      <strong>{p.type === "gift-set" ? "선택 상품 합계" : money(p.price)}</strong>
    </Link>
  );
}
