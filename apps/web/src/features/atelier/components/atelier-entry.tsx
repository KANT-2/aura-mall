import { testIds } from "@/lib/test-ids";
import Image from "next/image";
import { Asset } from "@/components/ui/asset";
import { UtilityIcon } from "@/components/ui/utility-icon";
import { useCatalog } from "@/features/catalog/hooks/use-catalog";
import styles from "@/features/atelier/components/atelier-entry.module.css";

export function AtelierEntry({
  draftCount,
  onResume,
  onSelect,
}: {
  draftCount?: number;
  onResume: () => void;
  onSelect: (familyId?: string) => void;
}) {
  const { scentFamilies } = useCatalog();
  return (
    <section data-atelier-entry className={`${styles.entry} page-width`}>
      <div className={styles.visual} aria-label="AURA 조향 안내 이미지">
        <Image
          className={styles.photo}
          src="/assets/products/warm-eau-de-parfum.webp"
          alt="AURA의 향수병과 자연 소재"
          fill
          sizes="(max-width: 900px) 100vw, 45vw"
          loading="eager"
        />
        <span className={styles.caption}>A PERSONAL SCENT / AURA ATELIER</span>
      </div>
      <div>
        <span className="eyebrow">A SCENT OF YOUR OWN</span>
        <h2>어떤 향 계열을 좋아하시나요?</h2>
        <p>익숙한 향의 계열에서 출발하거나, 원하는 향료를 자유롭게 골라 보세요.</p>
        {draftCount !== undefined && (
          <div className={styles.resume}>
            <div>
              <strong>만들던 향이 있어요</strong>
              <p>{draftCount}종의 향료를 다시 이어서 선택할 수 있어요.</p>
            </div>
            <button data-testid={testIds.atelier.resume} className="button" onClick={onResume}>
              이어서 만들기 <UtilityIcon name="arrow" />
            </button>
          </div>
        )}
        <div className={styles.families}>
          {scentFamilies.map((family) => (
            <button
              key={family.id}
              type="button"
              data-aura-family={family.id}
              onClick={() => onSelect(family.id)}
            >
              <Asset kind="ingredient" id={family.asset} />
              <strong>{family.name}</strong>
              <span>
                {family.english} · {family.description}
              </span>
            </button>
          ))}
        </div>
        <button
          data-testid={testIds.atelier.start}
          className={`button ${styles.start}`}
          onClick={() => onSelect()}
        >
          향료 직접 고르기 <UtilityIcon name="arrow" />
        </button>
      </div>
    </section>
  );
}
