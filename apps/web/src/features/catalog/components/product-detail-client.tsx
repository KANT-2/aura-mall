"use client";
import { MAX_QUANTITY } from "@/features/cart/model/cart";
import { useCatalog } from "@/features/catalog/hooks/use-catalog";
import { testIds } from "@/lib/test-ids";
import styles from "@/styles/commerce.module.css";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRef, useState } from "react";
import { type Product } from "@/features/catalog/model/catalog";
import { money } from "@/lib/format";
import { Arrow } from "@/components/ui/arrow";
import { ProductPhoto } from "@/features/catalog/components/product-photo";
import { Quantity } from "@/components/ui/quantity-input";
import { SectionHeading } from "@/components/ui/section-heading";
import { useCart } from "@/features/cart/hooks/use-cart";
import { useNotify } from "@/components/feedback/notification-provider";
import { ProductDetailContentDock } from "@/features/catalog/components/product-content";
import { ProductCard } from "@/features/catalog/components/product-card";

export function ProductDetail({ product: p }: { product: Product }) {
  const { products, collections } = useCatalog();
  const { add } = useCart(),
    notify = useNotify(),
    [n, setN] = useState(1),
    [selection, setSelection] = useState<string[]>([]),
    [added, setAdded] = useState(false);
  const preview = useRef<HTMLDialogElement>(null);
  const col = collections.find((c) => c.id === p.collection)!,
    gift = p.type === "gift-set";
  const eligible = products.filter((x) => x.collection === p.collection && x.type !== "gift-set");
  function toggle(id: string) {
    if (selection.includes(id)) {
      setSelection(selection.filter((x) => x !== id));
    } else if (selection.length < 3) {
      setSelection([...selection, id]);
    } else {
      notify("제품은 3개까지 선택할 수 있어요.");
    }
  }
  return (
    <main className={styles.root + " detail page-width"}>
      <nav className="breadcrumb" aria-label="현재 위치">
        <Link href="/shop">컬렉션</Link> /{" "}
        <Link href={"/shop?collection=" + col.id}>{col.name}</Link> / {p.typeName}
      </nav>
      <section className="detail-top">
        <div className="detail-image">
          <ProductPhoto
            product={p}
            loading="eager"
            selection={products.filter((product) => selection.includes(product.id))}
          />
          <button
            className="aura-photo-expand"
            type="button"
            onClick={() => preview.current?.showModal()}
            aria-label={p.name + " 제품 사진 크게 보기"}
          >
            확대해서 보기 <span aria-hidden="true">↗</span>
          </button>
        </div>
        <div className="detail-copy">
          <span className="eyebrow">{col.name} COLLECTION</span>
          <h1>{p.name}</h1>
          <span className="english-title">{p.englishName}</span>
          <p className="lead">{p.description}</p>
          <strong className="price">
            {gift
              ? selection.length === 3
                ? money(
                    selection.reduce(
                      (sum, id) => sum + (products.find((x) => x.id === id)?.price ?? 0),
                      0,
                    ),
                  )
                : "구성에 따라 가격이 달라져요"
              : money(p.price)}
          </strong>
          <dl className="specs">
            <div>
              <dt>구성 / 용량</dt>
              <dd>{p.volume}</dd>
            </div>
            <div>
              <dt>배송비</dt>
              <dd>50,000원 이상 구매 시 무료 · 기본 3,000원</dd>
            </div>
            <div>
              <dt>향의 무드</dt>
              <dd>{col.title}</dd>
            </div>
          </dl>
          {gift && (
            <div className="gift-summary">
              <span>
                선물에 담을 세 가지 향 <b>{selection.length} / 3</b>
              </span>
              <div className="gift-slots" aria-live="polite">
                {[0, 1, 2].map((i) => {
                  const s = products.find((x) => x.id === selection[i]);
                  return (
                    <div key={i}>
                      {s ? (
                        <>
                          <img src={s.image} alt="" />
                          <small>{s.typeName}</small>
                          <button aria-label={s.name + " 선택 해제"} onClick={() => toggle(s.id)}>
                            ×
                          </button>
                        </>
                      ) : (
                        <>
                          <span>0{i + 1}</span>
                          <small>제품을 선택해 주세요</small>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              <a className="text-link" href="#gift-options">
                구성 선택하기 ↓
              </a>
            </div>
          )}
          <div className="purchase-row">
            <Quantity max={MAX_QUANTITY} n={n} set={setN} />
            <button
              data-testid={testIds.catalog.addToCart}
              className="button"
              disabled={gift && selection.length !== 3}
              onClick={async () => {
                setAdded(await add(p, n, selection));
              }}
            >
              장바구니 담기 <Arrow />
            </button>
          </div>
          {added && (
            <Link className="added" href="/cart">
              장바구니에서 확인하기 →
            </Link>
          )}
          {gift && (
            <p className="micro">
              선택한 3개 상품 판매가의 합계이며, 별도 기프트 할인 및 포장 추가금은 적용하지
              않았어요.
            </p>
          )}
        </div>
      </section>
      {gift && (
        <section className="gift-options" id="gift-options">
          <SectionHeading
            number="01"
            title="받는 분의 일상을 떠올려 보세요"
            copy="같은 컬렉션의 서로 다른 제품을 3개 골라주세요."
          />
          <div className="gift-grid">
            {eligible.map((s) => (
              <label
                className={"gift-option " + (selection.includes(s.id) ? "selected" : "")}
                key={s.id}
              >
                <input
                  data-testid={testIds.catalog.giftOption}
                  type="checkbox"
                  checked={selection.includes(s.id)}
                  onChange={() => toggle(s.id)}
                  disabled={!selection.includes(s.id) && selection.length === 3}
                />
                <img src={s.image} alt={s.name} />
                <span>{s.typeName}</span>
                <small>{s.name}</small>
              </label>
            ))}
          </div>
        </section>
      )}
      <dialog
        ref={preview}
        className="aura-image-preview"
        aria-label={p.name + " 제품 이미지 미리보기"}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            preview.current?.close();
          }
        }}
      >
        <button
          type="button"
          className="aura-preview-close"
          aria-label="이미지 확대 닫기"
          onClick={() => preview.current?.close()}
        >
          ×
        </button>
        <div className="aura-preview-content">
          <ProductPhoto
            product={p}
            selection={products.filter((product) => selection.includes(product.id))}
          />
        </div>
      </dialog>
      <ProductDetailContentDock
        product={p}
        collectionTitle={col.title}
        collectionDescription={col.description}
      />
      <section className="related">
        <SectionHeading
          number="02"
          title="같은 향, 다른 순간"
          copy="좋아하는 향을 일상으로 넓혀보세요."
        />
        <div className="product-grid grid">
          {eligible
            .filter((x) => x.id !== p.id)
            .slice(0, 3)
            .map((x) => (
              <ProductCard key={x.id} product={x} />
            ))}
        </div>
      </section>
    </main>
  );
}
