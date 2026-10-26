import { testIds } from "@/lib/test-ids";
import type { Ingredient } from "@/features/catalog/model/catalog";
import type { Stage } from "@/features/atelier/model/composition";
import { MAX_DROPS } from "@/features/atelier/model/recipes";
import { Asset } from "@/components/ui/asset";
import { noteEnglish } from "@/features/atelier/lib/content";
import styles from "@/features/atelier/components/recipe-list.module.css";

export function RecipeList({
  selected,
  counts,
  ratio,
  total,
  editable,
  onDecrease,
  onAdd,
  onRemove,
}: {
  selected: Ingredient[];
  counts: Record<string, number>;
  ratio: Record<string, number>;
  total: number;
  editable: boolean;
  onDecrease: (id: string) => void;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className={styles.list} aria-label="선택한 향료 비중">
      {selected.map((note) => (
        <div data-recipe-note className={styles.chip} data-note={note.stage} key={note.id}>
          <div className={styles.portrait}>
            <Asset kind="ingredient" id={note.id} />
          </div>
          <div className={styles.content}>
            <span className={styles.category}>{noteEnglish[note.stage as Stage]}</span>
            <strong>{note.name}</strong>
            <div className={styles.amount}>
              <div className={styles.track} aria-hidden="true">
                <span style={{ width: `${ratio[note.id]}%`, background: note.color }} />
              </div>
              <small>
                {counts[note.id]}회 · {ratio[note.id]}%
              </small>
            </div>
          </div>
          {editable && (
            <div className={styles.actions}>
              <button
                aria-label={`${note.name} 1회 줄이기`}
                title="1회 줄이기"
                onClick={() => onDecrease(note.id)}
              >
                −
              </button>
              <button
                aria-label={`${note.name} 1회 추가`}
                title="1회 추가"
                disabled={total >= MAX_DROPS}
                onClick={() => onAdd(note.id)}
              >
                +
              </button>
              <button
                data-testid={testIds.atelier.removeIngredient(note.id)}
                aria-label={`${note.name} 삭제`}
                title="향료 제거"
                onClick={() => onRemove(note.id)}
              >
                ×
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
