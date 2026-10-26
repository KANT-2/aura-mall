import { testIds } from "@/lib/test-ids";
import type { RefObject } from "react";
import { useCatalog } from "@/features/catalog/hooks/use-catalog";
import { stageOrder, type Stage } from "@/features/atelier/model/composition";
import { MAX_DROPS } from "@/features/atelier/model/recipes";
import { Asset } from "@/components/ui/asset";
import { noteEnglish, stageDescriptions } from "@/features/atelier/lib/content";
import styles from "@/features/atelier/components/ingredient-picker.module.css";
import layout from "@/features/atelier/components/workspace.module.css";

export function IngredientPicker({
  panelRef,
  tab,
  counts,
  recommended,
  total,
  onAdd,
  onTab,
  onDragActive,
}: {
  panelRef: RefObject<HTMLElement | null>;
  tab: Stage;
  counts: Record<string, number>;
  recommended: string[];
  total: number;
  onAdd: (id: string) => void;
  onTab: (stage: Stage) => void;
  onDragActive: (active: boolean) => void;
}) {
  const { ingredients } = useCatalog();
  return (
    <section ref={panelRef} className={styles.ingredients}>
      <div data-atelier-part="panel-title" className={layout.panelTitle}>
        <h2>향료 고르기</h2>
        <span>24 NOTES</span>
      </div>
      {recommended.length > 0 && (
        <div className={styles.recommendation}>
          <span className="eyebrow">추천하는 첫 향료</span>
          <div>
            {recommended.map((id) => (
              <button key={id} disabled={total >= MAX_DROPS} onClick={() => onAdd(id)}>
                <Asset kind="ingredient" id={id} />
                {ingredients.find((note) => note.id === id)?.name}
                <span>+</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className={`tabs ${styles.tabs}`} role="tablist" aria-label="향 노트">
        {stageOrder.map((stage) => (
          <button key={stage} role="tab" aria-selected={tab === stage} onClick={() => onTab(stage)}>
            {stage === "top" ? "탑" : stage === "middle" ? "미들" : "베이스"}
            <small>{stage === "middle" ? "HEART" : stage.toUpperCase()}</small>
          </button>
        ))}
      </div>
      <p className="micro">{stageDescriptions[tab]} · 선택할 때마다 조합 비중이 조정돼요</p>
      <div className={styles.grid}>
        {ingredients
          .filter((note) => note.stage === tab)
          .map((note) => (
            <button
              data-testid={testIds.atelier.ingredient(note.id)}
              key={note.id}
              className={styles.card}
              draggable={total < MAX_DROPS}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "copy";
                event.dataTransfer.setData("application/x-aura-note", note.id);
                event.dataTransfer.setData("text/plain", note.id);
                onDragActive(true);
              }}
              onDragEnd={() => onDragActive(false)}
              aria-pressed={Boolean(counts[note.id])}
              aria-label={`${note.name} 한 방울 추가`}
              disabled={total >= MAX_DROPS}
              onClick={() => onAdd(note.id)}
              data-note={tab}
            >
              <small className={styles.note}>{noteEnglish[tab]}</small>
              <span className={styles.art}>
                <Asset kind="ingredient" id={note.id} />
              </span>
              <strong>{note.name}</strong>
              <small className={styles.description}>{note.description}</small>
              <span className={styles.count} aria-hidden="true">
                {counts[note.id] || "+"}
              </span>
              {counts[note.id] > 0 && (
                <span className={styles.check} aria-hidden="true">
                  ✓
                </span>
              )}
            </button>
          ))}
      </div>
    </section>
  );
}
