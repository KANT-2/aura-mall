/* eslint-disable @next/next/no-img-element */
import type { Product } from "@/features/catalog/model/catalog";
import { AuraWordmark } from "@/components/brand/wordmark";
export function ProductPhoto({
  product: p,
  loading = "lazy",
  selection = [],
}: {
  product: Product;
  loading?: "lazy" | "eager";
  selection?: Product[];
}) {
  return p.type === "gift-set" ? (
    <div className="gift-photo" role="img" aria-label={p.name + " — 같은 컬렉션의 제품 3개 선택"}>
      <span className="gift-photo-brand">
        <AuraWordmark className="a-gift-brand-mark" /> <small>THE GIFT OF SCENT</small>
      </span>
      <div>
        {(selection.length === 3
          ? selection.map((product) => product.image).filter((url): url is string => Boolean(url))
          : (p.giftImages ?? [])
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
