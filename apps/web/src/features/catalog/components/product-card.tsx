import { testIds } from "@/lib/test-ids";
import Link from "next/link";
import type { Product } from "@/features/catalog/model/catalog";
import { money } from "@/lib/format";
import styles from "@/styles/commerce.module.css";
import { ProductPhoto } from "@/features/catalog/components/product-photo";

export function ProductCard({ product: p }: { product: Product }) {
  const soldOut = p.stock <= 0;
  return (
    <Link
      href={"/shop/" + p.id}
      data-testid={testIds.catalog.card}
      className={soldOut ? `product-card ${styles.soldOutCard}` : "product-card"}
    >
      <div className="product-image">
        <ProductPhoto product={p} />
        {soldOut ? (
          <span className={styles.soldOutBadge} aria-label="품절">
            SOLD OUT
          </span>
        ) : (
          <span>자세히 보기 ↗</span>
        )}
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
