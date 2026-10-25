"use client";
import { useNativeShare } from "@/hooks/use-native-share";
import { AtelierHeader } from "@/features/atelier/components/atelier-header";
import { CompositionVessel } from "@/features/atelier/components/composition-vessel";
import { AtelierResult } from "@/features/atelier/components/atelier-result";
import { testIds } from "@/lib/test-ids";
import layoutStyles from "./workspace.module.css";
import modalStyles from "./atelier-dialog.module.css";
import recipeStyles from "./recipe-list.module.css";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useCatalog } from "@/features/catalog/hooks/use-catalog";
import { Asset } from "@/components/ui/asset";
import { useNotify } from "@/components/feedback/notification-provider";
import { MAX_DROPS, totalCount, mixColor } from "@/features/atelier/model/recipes";
import { AtelierModal } from "@/features/atelier/components/atelier-dialog";
import { UtilityIcon } from "@/components/ui/utility-icon";
import {
  percentages,
  stageOrder,
  stageRatiosForNames,
  type Stage,
} from "@/features/atelier/model/composition";
import { stageLabels } from "@/features/atelier/lib/content";
import type { AtelierDraft, Recipe, CustomComposition } from "@/features/atelier/model/recipes";
import type { RecipeInput } from "@/features/atelier/api/recipes";
import { useDraftAutosave } from "@/features/atelier/hooks/use-draft-autosave";
import { useComposition } from "@/features/atelier/hooks/use-composition";
import { useBlend } from "@/features/atelier/hooks/use-blend";
import { AtelierEntry } from "@/features/atelier/components/atelier-entry";
import { IngredientPicker } from "@/features/atelier/components/ingredient-picker";
import { RecipeList } from "@/features/atelier/components/recipe-list";
import { BlendExperience } from "@/features/atelier/components/blend-experience";

export function AtelierEditor({
  initialRecipe,
  initialDraft,
  resume,
  authenticated,
  onSave,
  onAddToCart,
  persistDraft,
  clearDraft,
  busy,
}: {
  initialRecipe?: Recipe;
  initialDraft: AtelierDraft | null;
  resume: boolean;
  authenticated: boolean;
  onSave: (recipe: RecipeInput) => Promise<boolean>;
  onAddToCart: (recipe: CustomComposition) => Promise<boolean>;
  persistDraft: (draft: AtelierDraft | null) => void;
  clearDraft: () => Promise<boolean>;
  busy: boolean;
}) {
  const { ingredients, products, scentFamilies, atelier } = useCatalog();
  const ingredientPanelRef = useRef<HTMLElement>(null);
  const notify = useNotify();
  const composition = useComposition({
    ingredients,
    draft: initialDraft,
    recipe: initialRecipe,
    resume,
  });
  const { state, pendingDraft } = composition;
  const autosave = useDraftAutosave(state, persistDraft);
  const { step, tab, counts, name, label, parent, recommended, drop } = state;
  const [overlay, setOverlay] = useState<"blend" | "recipe" | "info" | null>(null);
  const [showRatio, setShowRatio] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const canNativeShare = useNativeShare();
  const blend = useBlend(overlay === "blend");
  const { progress } = blend.snapshot;

  useEffect(() => {
    if (step !== "select") return;
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "instant" });
      ingredientPanelRef.current?.scrollTo({ top: 0, behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [step]);

  const total = totalCount(counts);
  const color = mixColor(counts, ingredients);
  const selected = useMemo(
    () =>
      ingredients
        .filter((i) => counts[i.id] > 0)
        .sort(
          (a, b) => stageOrder.indexOf(a.stage as Stage) - stageOrder.indexOf(b.stage as Stage),
        ),
    [counts, ingredients],
  );
  const ranked = useMemo(
    () => [...selected].sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0)),
    [selected, counts],
  );
  const ratio = useMemo(() => percentages(counts), [counts]);

  const customPerfumePrice =
    products.find((product) => product.type === "eau-de-parfum")?.price ?? null; // shared catalog source
  const mood = stageRatiosForNames(counts, ingredients);
  const suggestedNames = useMemo(() => {
    const theme = atelier.suggestedNames[mood];
    const dominant = [...selected].sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0))[0];
    return [...new Set([...theme, dominant ? `${dominant.name}의 순간` : "나의 향"])].slice(0, 5);
  }, [counts, selected, mood, atelier.suggestedNames]);

  function resumeDraft() {
    composition.resumeDraft();
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function newComposition() {
    autosave.cancel();
    blend.stop();
    setOverlay(null);
    composition.reset();
    void clearDraft();
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function add(id: string) {
    if (total >= MAX_DROPS) {
      notify("한 조합에서 최대 20번까지 선택할 수 있어요.");
      return;
    }
    composition.add(id);
  }
  function decrease(id: string) {
    composition.decrease(id);
  }
  function remove(id: string) {
    composition.remove(id);
  }
  function openSelection(familyId?: string) {
    const family = scentFamilies.find((item) => item.id === familyId);
    composition.select(family ? [...family.notes] : []);
  }
  function startBlend() {
    if (!total) return;
    blend.reset();
    setOverlay("blend");
  }
  function closeOverlay() {
    blend.stop();
    setOverlay(null);
  }
  function dropIngredient(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragActive(false);
    add(
      event.dataTransfer.getData("application/x-aura-note") ||
        event.dataTransfer.getData("text/plain"),
    );
  }
  function recipeText() {
    return `${name || "나의 향"} / AURA ATELIER\n${stageOrder
      .map(
        (st) =>
          `${stageLabels[st]}: ${
            selected
              .filter((n) => n.stage === st)
              .map((n) => `${n.name} ${counts[n.id]}회`)
              .join(" · ") || "없음"
          }`,
      )
      .join("\n")}\n총 ${total}회 · ${selected.length}종`;
  }
  async function shareRecipe() {
    if (typeof navigator.share !== "function") {
      notify("현재 기기에서 공유를 지원하지 않아요.");
      return;
    }
    try {
      await navigator.share({ title: `AURA | ${name || "나의 향"}`, text: recipeText() });
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") notify("공유를 완료하지 못했어요.");
    }
  }
  function enterResult() {
    if (!blend.snapshot.complete) return;
    closeOverlay();
    composition.finish(blend.snapshot.complete);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" }));
  }
  async function record() {
    if (!name.trim()) {
      notify("향 이름을 입력해 주세요.");
      return;
    }
    if (!authenticated) {
      notify("로그인 후 향을 저장할 수 있어요.");
      return;
    }
    const revision = state.revision;
    const didSave = await onSave({
      parent: parent?.id,
      name: name.trim(),
      label,
      counts: { ...counts },
    });
    if (didSave) composition.markSaved(revision);
  }

  async function putInCart() {
    if (!name.trim()) {
      notify("향 이름을 먼저 정해 주세요.");
      return;
    }
    if (!total) {
      notify("향료를 선택해 주세요.");
      return;
    }
    const revision = state.revision;
    const added = await onAddToCart({
      color,
      name: name.trim(),
      label,
      counts: { ...counts },
      recipeKey: parent?.id || undefined,
      productType: "eau-de-parfum",
    });
    if (added) composition.markCartAdded(revision);
  }
  const recipeList = (
    <RecipeList
      selected={selected}
      counts={counts}
      ratio={ratio}
      total={total}
      editable={step !== "result"}
      onDecrease={decrease}
      onAdd={add}
      onRemove={remove}
    />
  );

  return (
    <main
      data-testid={testIds.atelier.root}
      data-atelier
      data-atelier-step={step}
      className={`${layoutStyles.page} ${step === "select" ? `${layoutStyles.editing}` : ""}`}
    >
      <AtelierHeader step={step} blending={overlay === "blend"} />
      {step === "entry" ? (
        <AtelierEntry
          draftCount={pendingDraft ? Object.keys(pendingDraft.counts).length : undefined}
          onResume={resumeDraft}
          onSelect={openSelection}
        />
      ) : step === "select" ? (
        <>
          <div className={layoutStyles.workspace} inert={overlay !== null}>
            <IngredientPicker
              panelRef={ingredientPanelRef}
              tab={tab}
              counts={counts}
              recommended={recommended}
              total={total}
              onAdd={add}
              onTab={composition.changeTab}
              onDragActive={setDragActive}
            />
            <CompositionVessel
              counts={counts}
              drop={drop}
              dragActive={dragActive}
              showRatio={showRatio}
              onToggleRatio={() => setShowRatio((value) => !value)}
              onDrop={dropIngredient}
              onClear={composition.clear}
              onHelp={() => setOverlay("info")}
            />
            <aside className={recipeStyles.summary}>
              <div data-atelier-part="panel-title" className={layoutStyles.panelTitle}>
                <h2>내가 담은 향</h2>
                <span>{selected.length}종</span>
              </div>
              <div className={recipeStyles.scroll}>
                {total ? (
                  recipeList
                ) : (
                  <div className={recipeStyles.empty}>
                    <Asset id="droplet" />
                    <p>
                      좋아하는 향료부터 담아 보세요.
                      <br />한 방울씩 나만의 향이 쌓여요.
                    </p>
                  </div>
                )}
              </div>
              <p className="micro">
                선택 횟수는 취향을 시각화한 값이에요. 실제 제조 배합은 중량·원료 특성·안전 기준에
                따라 별도 검토해요.
              </p>
              <button
                data-testid={testIds.atelier.blend}
                data-atelier-blend
                className={`button ${recipeStyles.blend}`}
                disabled={!total}
                onClick={startBlend}
              >
                이 조합으로 향 섞기 <UtilityIcon name="arrow" />
              </button>
            </aside>
          </div>
          <div
            data-testid={testIds.atelier.dock}
            data-atelier-dock
            className={layoutStyles.dock}
            inert={overlay !== null}
          >
            <button
              data-testid={testIds.atelier.recipe}
              aria-label="내가 담은 향 보기"
              className={layoutStyles.dockSummary}
              onClick={() => setOverlay("recipe")}
            >
              <span className={layoutStyles.colorDot} style={{ background: color }} />
              <span>
                {selected.length}종 · {total}/20회<small>내가 담은 향 보기</small>
              </span>
              <UtilityIcon name="adjust" />
            </button>
            <button
              data-testid={testIds.atelier.blend}
              className="button"
              disabled={!total}
              onClick={startBlend}
            >
              향 섞기 <UtilityIcon name="arrow" />
            </button>
          </div>
        </>
      ) : (
        <AtelierResult
          state={state}
          selected={selected}
          suggestedNames={suggestedNames}
          price={customPerfumePrice}
          isAuthenticated={authenticated}
          recipeList={recipeList}
          onNameChange={composition.rename}
          onLabelChange={composition.changeLabel}
          busy={busy}
          onAddToCart={putInCart}
          onSave={record}
          onRestart={newComposition}
          onEdit={() => {
            composition.edit();
            window.scrollTo({ top: 0, behavior: "instant" });
          }}
          onShare={canNativeShare ? shareRecipe : undefined}
        />
      )}
      {overlay && (
        <AtelierModal
          title={
            overlay === "blend"
              ? progress < 100
                ? "향이 어우러지는 시간"
                : "당신의 향이 완성되었어요"
              : overlay === "recipe"
                ? "내가 담은 향"
                : "향 만들기 안내"
          }
          onClose={closeOverlay}
        >
          {overlay === "recipe" ? (
            <div data-atelier-part="dialog-content" className={modalStyles.content}>
              {total ? recipeList : <p>아직 담은 향료가 없어요.</p>}
              <button
                data-testid={testIds.atelier.blend}
                className="button"
                disabled={!total}
                onClick={startBlend}
              >
                향 섞기 <UtilityIcon name="arrow" />
              </button>
            </div>
          ) : overlay === "info" ? (
            <div data-atelier-part="dialog-content" className={modalStyles.content}>
              <p>탑은 첫인상, 미들은 향의 중심, 베이스는 잔향을 표현해요.</p>
              <p>
                마음에 드는 향료를 눌러 최대 20회까지 담아 보세요. 섞기 버튼을 누르면 조합이
                완성돼요.
              </p>
              <p>
                향료는 취향을 조합하는 인터랙션이며 20회 선택과 비율은 실제 제조 처방·향료 농도를
                의미하지 않아요. 전문 배합은 원료별 중량과 안전 기준을 따릅니다.
              </p>
            </div>
          ) : (
            <BlendExperience
              state={blend.snapshot}
              vesselEvents={blend.vesselEvents}
              onStartAutomatic={blend.startAutomatic}
              onEnableShake={blend.enableShake}
              total={total}
              color={color}
              ranked={ranked}
              onFinish={enterResult}
            />
          )}
        </AtelierModal>
      )}
    </main>
  );
}
