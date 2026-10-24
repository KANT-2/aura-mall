"use client";
import styles from "./Commerce.module.css";
/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { collections, products, types } from "@/lib/aura/catalog";
import { Asset } from "../editorial/Shared";
import { StyledSelect } from "../ui/StyledSelect";
import { ProductCard } from "./ProductCard";

const knownCollection = (v = "") => (collections.some((x) => x.id === v) ? v : "");
const knownType = (v = "") => (types.some((t) => t.id === v) ? v : "");

export function Shop({
  initialCollection = "",
  initialType = "",
  initialQuery = "",
}: {
  initialCollection?: string;
  initialType?: string;
  initialQuery?: string;
}) {
  const [c, setC] = useState(knownCollection(initialCollection)),
    [type, setType] = useState(knownType(initialType)),
    [query, setQuery] = useState(initialQuery),
    [sort, setSort] = useState("default");
  const collection = collections.find((x) => x.id === c);
  const router = useRouter();
  // Last q this component wrote to the URL. Its echo through `initialQuery`
  // must not overwrite the input while the user is still typing (e.g. "white ").
  const pushedQuery = useRef(initialQuery);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      // A fresh filter reset from PR #14 still removes the stale q parameter.
      const current = new URLSearchParams(window.location.search);
      const q = query.trim();
      if(q) current.set("q",q); else current.delete("q");
      if((current.get("q")||"") !== initialQuery) {
        pushedQuery.current = q;
        router.replace("/shop" + (current.toString() ? "?" + current : ""), {scroll:false});
      }
    }, 320);
    return () => window.clearTimeout(timer);
  },[query,initialQuery,router]);
  useEffect(() => {
    const co = knownCollection(initialCollection),
      ty = knownType(initialType);
    setC(co);
    setType(ty);
    // Unknown collection/type values are dropped so URL, tabs and results agree.
    if (co !== initialCollection || ty !== initialType) {
      const s = new URLSearchParams(window.location.search);
      if (co !== initialCollection) s.delete("collection");
      if (ty !== initialType) s.delete("type");
      router.replace("/shop" + (s.toString() ? "?" + s : ""), { scroll: false });
    }
    // Only external URL changes (header search, back/forward, reset) replace the input.
    if (initialQuery !== pushedQuery.current) {
      pushedQuery.current = initialQuery;
      setQuery(initialQuery);
    }
  }, [initialCollection, initialType, initialQuery, router]);
  const update = (co: string, ty: string, q = query) => {
    setC(co);
    setType(ty);
    const s = new URLSearchParams();
    if (co) s.set("collection", co);
    if (ty) s.set("type", ty);
    pushedQuery.current = q.trim();
    if (q.trim()) s.set("q", q.trim());
    router.replace("/shop?" + s.toString(), { scroll: false });
  };
  const keyword = query.trim().toLowerCase();
  const list = products
    .filter(
      (p) =>
        (!c || p.collection === c) &&
        (!type || p.type === type) &&
        [p.name, p.englishName, p.typeName, p.description]
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
          <span className="eyebrow">
            AURA COLLECTION / {collection?.name || "ALL"}
          </span>
          <h1>{collection?.title || "향으로 채우는 일상"}</h1>
          <p>
            {collection?.description ||
              "피부에, 머릿결에, 머무는 공간에. 당신의 향을 만나보세요."}
          </p>
        </div>
        <Asset id={"collection-" + (c || "fresh")} />
      </div>
      <div className="tabs">
        <button
          className={!c ? "selected" : ""}
          onClick={() => update("", type)}
        >
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
          <StyledSelect label="제품 유형" value={type} onChange={v=>update(c,v)} options={[{value:"",label:"전체 유형"},...types.map(t=>({value:t.id,label:t.label}))]}/>
        </label>
        <label className="search-field">
          상품 검색
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="상품명 또는 향의 분위기"
          />
        </label>
        <label>
          정렬
          <StyledSelect label="정렬" value={sort} onChange={setSort} options={[{value:"default",label:"추천순"},{value:"low",label:"가격 낮은 순"},{value:"high",label:"가격 높은 순"}]}/>
        </label>
      </div>
      <div className="result-line" role="status" aria-live="polite">{list.length}개의 향 제품</div>
      {list.length ? (
        <div className="product-grid grid">
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
