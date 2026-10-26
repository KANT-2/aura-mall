"use client";
/* eslint-disable @next/next/no-img-element */
import { useState, useId, type CSSProperties } from "react";
import type { Product } from "@/features/catalog/model/catalog";

/**
 * Figma integration boundary: bqmZeosTRQcTPixfHyheRp / node 4005:2.
 * The Figma page contains many unfinished editorial frames. Do not duplicate
 * those 17 sections inside the live page until their assets/data are approved.
 * Pass finalized pieces through the optional `editorial` slot later.
 */
export type ProductEditorialSlot = {
  /** Team's finalized media/copy component, once approved. */
  content?: React.ReactNode;
};

const TABS = [
  { id: "scent", label: "향 이야기" },
  { id: "spec", label: "제품 정보" },
  { id: "shipping", label: "배송·교환" },
  { id: "qa", label: "Q&A" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function ProductDetailContentDock({
  product,
  collectionTitle,
  collectionDescription,
  editorial,
}: {
  product: Product;
  collectionTitle: string;
  collectionDescription: string;
  editorial?: ProductEditorialSlot;
}) {
  const [tab, setTab] = useState<TabId>("scent");
  const tabsId = useId();
  const activeTab = `${tabsId}-${tab}`;
  const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, current: number) => {
    let next = current;
    if (event.key === "ArrowRight") {
      next = (current + 1) % TABS.length;
    } else if (event.key === "ArrowLeft") {
      next = (current + TABS.length - 1) % TABS.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = TABS.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    setTab(TABS[next].id);
    document.getElementById(`${tabsId}-${TABS[next].id}`)?.focus();
  };

  return (
    <section className="a85-detail-dock" aria-label="상품 상세 정보">
      <div
        className="a85-detail-dock__tabs"
        role="tablist"
        aria-label="상품 상세 정보 선택"
        style={
          {
            "--aura-tab-offset": `${TABS.findIndex((item) => item.id === tab) * 100}%`,
          } as CSSProperties
        }
      >
        {TABS.map((item, index) => (
          <button
            key={item.id}
            id={`${tabsId}-${item.id}`}
            type="button"
            role="tab"
            aria-controls={`${tabsId}-panel`}
            aria-selected={tab === item.id}
            tabIndex={tab === item.id ? 0 : -1}
            className={tab === item.id ? "is-current" : ""}
            onClick={() => setTab(item.id)}
            onKeyDown={(e) => onTabKeyDown(e, index)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        id={`${tabsId}-panel`}
        role="tabpanel"
        aria-labelledby={activeTab}
        tabIndex={0}
        className="a85-detail-dock__panel"
      >
        <div className="a85-detail-dock__tab-scene" key={tab}>
          {tab === "scent" && (
            <div className="a85-detail-dock__story">
              <p className="a85-detail-dock__overline">FROM SCENT TO IDENTITY</p>
              <h3>{collectionTitle}</h3>
              <p className="a85-detail-dock__intro">{collectionDescription}</p>
              <div className="a85-detail-dock__notes" aria-label="향의 구성">
                {product.notes.map((note, i) => (
                  <div key={`${note}-${i}`} className="a85-note">
                    {product.noteImages?.[note] ? (
                      <img
                        src={product.noteImages?.[note]}
                        loading="lazy"
                        decoding="async"
                        alt=""
                      />
                    ) : (
                      <span className="a85-note__fallback" aria-hidden="true">
                        ✳
                      </span>
                    )}
                    <span className="a85-note__stage">{["TOP", "HEART", "BASE"][i] ?? "NOTE"}</span>
                    <strong>{note}</strong>
                  </div>
                ))}
              </div>
              {editorial?.content && (
                <div className="a85-figma-editorial-slot">{editorial.content}</div>
              )}
            </div>
          )}
          {tab === "spec" && (
            <div className="a85-detail-dock__accordion">
              <details open>
                <summary>제품 기본 정보</summary>
                <div className="a85-detail-dock__detail">
                  <span>제품명</span>
                  <strong>{product.name}</strong>
                  <span>구성 및 용량</span>
                  <strong>{product.volume}</strong>
                  <span>상품 유형</span>
                  <strong>{product.typeName}</strong>
                </div>
              </details>
              <details>
                <summary>사용 방법과 보관</summary>
                <p>
                  사용 후 용기를 단단히 닫아 주시고, 직사광선과 고온을 피해 보관해 주세요. 제품
                  유형별 사용법은 확인된 제품 안내에 따릅니다.
                </p>
              </details>
              <details>
                <summary>전성분 및 제품 고시</summary>
                <p>
                  제품별로 확인된 성분과 고시 자료를 이 영역에 연결합니다. 확정되지 않은 성분이나
                  효능을 임의로 안내하지 않습니다.
                </p>
              </details>
            </div>
          )}
          {tab === "shipping" && (
            <div className="a85-detail-dock__accordion">
              <details open>
                <summary>배송 안내</summary>
                <p>
                  상품금액 합계가 50,000원 이상이면 무료배송이며, 미만일 때 기본 배송비는
                  3,000원입니다. 최종 배송비는 장바구니 및 주문 화면에서 확인해 주세요.
                </p>
              </details>
              <details>
                <summary>교환·반품 안내</summary>
                <p>
                  교환·반품 가능 여부와 처리 방법은 제품 상태 및 적용되는 소비자 보호 규정에 따라
                  안내합니다. 상세 운영 정책이 확정되면 이 영역에 연동합니다.
                </p>
              </details>
            </div>
          )}
          {tab === "qa" && (
            <div className="a85-detail-dock__qa">
              <p>등록된 상품 문의가 없습니다.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
