"use client";
import { useCatalog } from "@/features/catalog/hooks/use-catalog";
import { testIds } from "@/lib/test-ids";
import styles from "@/styles/commerce.module.css";
import { useProductFilters } from "@/features/catalog/hooks/use-product-filters";

import { Asset } from "@/components/ui/asset";
import { StyledSelect } from "@/components/ui/select";
import { ProductCard } from "@/features/catalog/components/product-card";

export function Shop({
  initialCollection = "",
  initialType = "",
  initialQuery = "",
}: {
  initialCollection?: string;
  initialType?: string;
  initialQuery?: string;
}) {
  const { products, collections, types } = useCatalog();
  const {
    collectionId: c,
    typeId: type,
    query,
    sort,
    changeQuery: setQuery,
    changeSort: setSort,
    select: update,
  } = useProductFilters({ initialCollection, initialType, initialQuery }, collections, types);
  const collection = collections.find((item) => item.id === c);
  const keyword = query.trim().toLowerCase();
  const list = products
    .filter(
      (p) =>
        (!c || p.collection === c) &&
        (!type || p.type === type) &&
        [p.name, p.englishName, p.typeName, p.description, ...p.notes]
          .join(" ")
          .toLowerCase()
          .includes(keyword),
    )
    .sort((a, b) =>
      sort === "low"
        ? (a.price ?? Infinity) - (b.price ?? Infinity)
        : sort === "high"
          ? (b.price ?? -1) - (a.price ?? -1)
          : 0,
    );
  return (
    <main className={styles.root + " shop page-width"}>
      <div className="shop-title">
        <div>
          <span className="eyebrow">AURA COLLECTION / {collection?.name || "ALL"}</span>
          <h1>{collection?.title || "향으로 채우는 일상"}</h1>
          <p>
            {collection?.description || "피부에, 머릿결에, 머무는 공간에. 당신의 향을 만나보세요."}
          </p>
        </div>
        <Asset id={"collection-" + (c || "fresh")} />
      </div>
      <div className="tabs">
        <button className={!c ? "selected" : ""} onClick={() => update("", type)}>
          전체
        </button>
        {collections.map((x) => (
          <button
            key={x.id}
            className={c === x.id ? "selected" : ""}
            onClick={() => update(x.id, type)}
          >
            {x.name}
          </button>
        ))}
      </div>
      <div className="filter-row">
        <label>
          제품 유형
          <StyledSelect
            label="제품 유형"
            value={type}
            onChange={(v) => update(c, v)}
            options={[
              { value: "", label: "전체 유형" },
              ...types.map((t) => ({ value: t.id, label: t.label })),
            ]}
          />
        </label>
        <label className="search-field">
          상품 검색
          <input
            data-testid={testIds.catalog.search}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="상품명 또는 향의 분위기"
          />
        </label>
        <label>
          정렬
          <StyledSelect
            testId={testIds.catalog.sort}
            label="정렬"
            value={sort}
            onChange={setSort}
            options={[
              { value: "default", label: "추천순" },
              { value: "low", label: "가격 낮은 순" },
              { value: "high", label: "가격 높은 순" },
            ]}
          />
        </label>
      </div>
      <div className="result-line" role="status" aria-live="polite">
        {list.length}개의 향 제품
      </div>
      {list.length ? (
        <div data-testid={testIds.catalog.grid} className="product-grid grid">
          {list.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <Asset id="scent-strip" />
          <h2>검색한 상품이 없어요.</h2>
          <p>다른 이름으로 검색하거나 필터를 바꿔보세요.</p>
          <button
            onClick={() => {
              setQuery("");
              setSort("default");
              update("", "", "");
            }}
          >
            필터 초기화
          </button>
        </div>
      )}
    </main>
  );
}
