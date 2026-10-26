import type { Ingredient } from "@/features/catalog/model/catalog";
import { AuraWordmark } from "@/components/brand/wordmark";
import { Asset } from "@/components/ui/asset";
import styles from "@/features/atelier/components/bottle-preview.module.css";

export function BottlePreview({
  label,
  name,
  total,
  selected,
}: {
  label: string;
  name: string;
  total: number;
  selected: Ingredient[];
}) {
  return (
    <div data-label={label} className={styles.bottle}>
      <span className={`${styles.caption} eyebrow`}>THE SCENT YOU MADE / AURA</span>
      <div className={styles.gallery} aria-label={`선택한 향료 ${selected.length}종`}>
        {selected.map((note) => (
          <div className={styles.note} key={note.id}>
            <Asset kind="ingredient" id={note.id} />
            <span>{note.name}</span>
          </div>
        ))}
      </div>
      <div className={styles.vessel}>
        <Asset id="custom-bottle" />
        <div className={styles.label} aria-label={`선택한 ${label} 라벨 미리보기`}>
          {label === "classic" ? (
            <>
              <AuraWordmark className={styles.brand} />
              <strong>{name || "나의 향"}</strong>
              <small>PERSONAL SCENT</small>
            </>
          ) : label === "paper" ? (
            <>
              <small>NO. {String(total).padStart(2, "0")}</small>
              <AuraWordmark className={styles.brand} />
              <strong>{name || "나의 향"}</strong>
              <small>HANDCRAFTED BLEND</small>
            </>
          ) : (
            <>
              <AuraWordmark className={styles.brand} />
              <strong>{name || "나의 향"}</strong>
              <span className={styles.labelRule} />
            </>
          )}
        </div>
      </div>
      <p className="micro">선택한 모든 향료가 담긴 나만의 조합입니다.</p>
    </div>
  );
}
