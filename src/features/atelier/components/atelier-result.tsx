import Link from "next/link";
import type { ReactNode } from "react";
import type { Ingredient } from "@/features/catalog/model/catalog";
import { stageOrder, type AtelierState } from "@/features/atelier/model/composition";
import { totalCount } from "@/features/atelier/model/recipes";
import { money } from "@/lib/format";
import { testIds } from "@/lib/test-ids";
import { UtilityIcon } from "@/components/ui/utility-icon";
import { stageLabels } from "@/features/atelier/lib/content";
import { BottlePreview } from "@/features/atelier/components/bottle-preview";
import personalizationStyles from "./personalization.module.css";
import resultStyles from "./atelier-result.module.css";

type AtelierResultProps = {
  state: AtelierState;
  busy: boolean;
  selected: Ingredient[];
  suggestedNames: string[];
  price: number | null;
  isAuthenticated: boolean;
  recipeList: ReactNode;
  onNameChange: (name: string) => void;
  onLabelChange: (label: string) => void;
  onAddToCart: () => void;
  onSave: () => void;
  onRestart: () => void;
  onEdit: () => void;
  onShare?: () => Promise<void>;
};
export function AtelierResult({
  state,
  busy,
  selected,
  suggestedNames,
  price,
  isAuthenticated,
  recipeList,
  onNameChange,
  onLabelChange,
  onAddToCart,
  onSave,
  onRestart,
  onEdit,
  onShare,
}: AtelierResultProps) {
  const { name, label, parent, saved, cartAdded, counts } = state;
  const total = totalCount(counts);
  const stages = stageOrder.map((stage) => selected.filter((note) => note.stage === stage));
  return (
    <section data-atelier-part="result" className={`${resultStyles.result} page-width`}>
      <BottlePreview label={label} name={name} total={total} selected={selected} />
      <div data-atelier-result className={resultStyles.form}>
        <span className="eyebrow">
          VERSION {parent ? parent.version + 1 : 1} · PRIVATE COMPOSITION
        </span>
        <h2>이 향에 이름을 붙여 주세요.</h2>
        <p className={resultStyles.lede}>
          고른 향료가 하나의 조합으로 완성되었어요. 오래 간직하고 싶은 순간의 이름을 남겨 주세요.
        </p>
        <label data-atelier-name className={personalizationStyles.nameField}>
          향 이름
          <input
            data-testid={testIds.atelier.name}
            value={name}
            maxLength={30}
            onChange={(e) => {
              onNameChange(e.target.value);
            }}
            placeholder="예: 느린 오후"
          />
        </label>
        <div className={personalizationStyles.suggestions}>
          <div className={personalizationStyles.suggestionHeading}>
            <strong>향 이름 추천</strong>
            <small>선택한 노트의 분위기를 바탕으로 제안해요</small>
          </div>
          <div className={personalizationStyles.suggestionList}>
            {suggestedNames.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={name === n}
                onClick={() => {
                  onNameChange(n);
                }}
              >
                {n}
                <span aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
        </div>
        <fieldset data-label-options className={personalizationStyles.labelStyles}>
          <legend>
            라벨 스타일 <small>선택하면 왼쪽 병에 바로 반영돼요</small>
          </legend>
          {[
            ["classic", "클래식", "테두리 · 세리프"],
            ["paper", "페이퍼", "종이 · 활자"],
            ["minimal", "미니멀", "여백 · 모던"],
          ].map(([id, text, desc]) => (
            <label key={id} className={personalizationStyles.swatch}>
              <input
                type="radio"
                name="label"
                checked={label === id}
                onChange={() => {
                  onLabelChange(id);
                }}
              />
              <span>
                <strong>{text}</strong>
                <small>{desc}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <div className={resultStyles.pyramid}>
          {stageOrder.map((st, index) => (
            <div key={st}>
              <span className="eyebrow">{stageLabels[st]}</span>
              <p>{stages[index].map((n) => n.name).join(" · ") || "—"}</p>
            </div>
          ))}
        </div>
        <details data-atelier-part="recipe-details" className={resultStyles.details}>
          <summary>
            전체 레시피 보기 · {selected.length}종 / {total}회
          </summary>
          {recipeList}
        </details>
        <div className={resultStyles.product}>
          <span className="eyebrow">THE SCENT YOU MADE</span>
          <div className={resultStyles.productRow}>
            <strong>커스텀 오 드 퍼퓸 · 50mL</strong>
            <strong>{money(price)}</strong>
          </div>
          <p>
            현재 맞춤 조향은 오 드 퍼퓸 50mL로 제공해요. 선택한 향료와 라벨이 주문 정보에 함께
            담겨요.
          </p>
        </div>
        <div className={resultStyles.actions}>
          <button
            data-testid={testIds.atelier.addToCart}
            className={`button ${resultStyles.buy}`}
            disabled={price === null || busy || cartAdded || !name.trim()}
            onClick={onAddToCart}
          >
            <UtilityIcon name="arrow" />
            {cartAdded ? "장바구니에 추가됨" : "이 향을 장바구니에 담기"}
          </button>
          {cartAdded && (
            <Link className={`button ${resultStyles.cartLink}`} href="/cart">
              장바구니 보기 →
            </Link>
          )}
          {isAuthenticated ? (
            <button className="button" disabled={busy || saved || !name.trim()} onClick={onSave}>
              <UtilityIcon name="heart" />
              {saved ? "저장 완료" : "나의 향 저장하기"}
            </button>
          ) : (
            <Link className="button" href="/login?next=%2Fatelier%3Fresume%3D1">
              로그인하고 향 저장하기
            </Link>
          )}
        </div>
        <div className={resultStyles.secondaryActions}>
          <button
            type="button"
            data-testid={testIds.atelier.restart}
            className={resultStyles.actionLink}
            onClick={onRestart}
          >
            <UtilityIcon name="reset" /> 새 향 만들기
          </button>
          {onShare && (
            <button type="button" className={resultStyles.actionLink} onClick={onShare}>
              <UtilityIcon name="share" /> 공유하기
            </button>
          )}
          <button
            type="button"
            data-testid={testIds.atelier.edit}
            className={resultStyles.actionLink}
            onClick={() => {
              onEdit();
            }}
          >
            <UtilityIcon name="adjust" /> 조합 수정
          </button>
        </div>
        {saved && (
          <Link className="text-link" href="/mypage">
            저장한 향 보러 가기 →
          </Link>
        )}
      </div>
    </section>
  );
}
