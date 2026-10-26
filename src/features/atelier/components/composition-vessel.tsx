import type { DragEvent } from "react";
import { useCatalog } from "@/features/catalog/hooks/use-catalog";
import { stageOrder, percentages } from "@/features/atelier/model/composition";
import { MAX_DROPS, mixColor, totalCount } from "@/features/atelier/model/recipes";
import { testIds } from "@/lib/test-ids";
import { Beaker } from "@/components/illustrations/beaker";
import { UtilityIcon } from "@/components/ui/utility-icon";
import { noteEnglish } from "@/features/atelier/lib/content";
import vesselStyles from "@/features/atelier/components/composition-vessel.module.css";
import modalStyles from "@/features/atelier/components/atelier-dialog.module.css";

type CompositionVesselProps = {
  counts: Record<string, number>;
  drop: number;
  dragActive: boolean;
  showRatio: boolean;
  onToggleRatio: () => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onClear: () => void;
  onHelp: () => void;
};
export function CompositionVessel({
  counts,
  drop,
  dragActive,
  showRatio,
  onToggleRatio,
  onDrop,
  onClear,
  onHelp,
}: CompositionVesselProps) {
  const { ingredients } = useCatalog();
  const total = totalCount(counts);
  const color = mixColor(counts, ingredients);
  const selected = ingredients.filter((note) => counts[note.id] > 0);
  const stages = stageOrder.map((stage) => selected.filter((note) => note.stage === stage));
  const atmosphere =
    stages[1].length > stages[0].length
      ? "풍성한 중심 노트"
      : stages[2].length > stages[0].length
        ? "차분한 잔향 중심"
        : "균형을 찾아가는 중";
  const stageRatios = stageOrder.map((stage) =>
    ingredients
      .filter((note) => note.stage === stage)
      .reduce((total, note) => total + (counts[note.id] || 0), 0),
  );
  const stagePercentages = percentages(
    Object.fromEntries(stageOrder.map((stage, index) => [stage, stageRatios[index]])),
  );
  const stageBadge =
    stageRatios[1] > stageRatios[0] && stageRatios[1] >= stageRatios[2]
      ? "FLORAL FORWARD"
      : stageRatios[2] > stageRatios[0]
        ? "WOODY BASE"
        : "BALANCED BLEND";
  return (
    <section
      className={`${vesselStyles.vessel} ${dragActive ? `${vesselStyles.dropTarget}` : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={onDrop}
    >
      <span className="eyebrow">YOUR BLEND</span>
      <span className={vesselStyles.hint} aria-live="polite">
        {dragActive ? "이곳에 놓아 향을 담아 주세요" : "향료를 선택하거나 이곳에 끌어다 놓으세요"}
      </span>
      <div className={vesselStyles.art}>
        <Beaker count={total} color={color} drop={drop} />
        {drop > 0 && (
          <span key={drop} className={vesselStyles.impact} style={{ borderColor: color }} />
        )}
      </div>
      <div className={vesselStyles.counters}>
        <div>
          <strong>{selected.length}</strong>
          <small>선택한 향료</small>
        </div>
        <div className={vesselStyles.total}>
          <strong>
            {total}
            <small>/20</small>
          </strong>
          <small>담은 횟수</small>
        </div>
      </div>
      <div
        data-testid={testIds.atelier.dropCount}
        className={vesselStyles.meter}
        role="progressbar"
        aria-label="향료 투입 횟수"
        aria-valuenow={total}
        aria-valuemin={0}
        aria-valuemax={MAX_DROPS}
      >
        <span
          style={{
            width: `${total * 5}%`,
            background: `linear-gradient(90deg,#eddfc1,${color})`,
          }}
        />
        {[1, 2, 3, 4].map((n) => (
          <i key={n} style={{ left: `${n * 20}%` }} />
        ))}
      </div>
      <div className={vesselStyles.meterLabels}>
        <span>0</span>
        <span>5</span>
        <span>10</span>
        <span>15</span>
        <span>20회</span>
      </div>
      <div className={vesselStyles.badge}>
        <span style={{ background: color }} />
        {atmosphere}
        <small>{stageBadge}</small>
      </div>
      <button
        className={vesselStyles.ratioToggle}
        type="button"
        aria-expanded={showRatio}
        onClick={onToggleRatio}
      >
        {showRatio ? "상세 비중 접기 −" : "배합 비중 자세히 보기 +"}
      </button>
      {showRatio && (
        <div className={vesselStyles.ratios} role="group" aria-label="선택한 향료 노트별 비중">
          {stageOrder.map((stage) => (
            <div className={vesselStyles.ratioRow} key={stage}>
              <small>{noteEnglish[stage]}</small>
              <div className={vesselStyles.ratioTrack}>
                <span style={{ width: `${stagePercentages[stage] || 0}%` }} data-stage={stage} />
              </div>
              <strong>{stagePercentages[stage] || 0}%</strong>
            </div>
          ))}
        </div>
      )}
      <div className={vesselStyles.tools}>
        <button
          data-atelier-part="icon-button"
          className={modalStyles.iconButton}
          data-testid={testIds.atelier.clear}
          aria-label="전체 비우기"
          disabled={!total}
          onClick={() => {
            onClear();
          }}
        >
          <UtilityIcon name="reset" />
        </button>
        <button
          data-atelier-part="icon-button"
          className={modalStyles.iconButton}
          aria-label="조향 도움말"
          onClick={onHelp}
        >
          <UtilityIcon name="info" />
        </button>
      </div>
    </section>
  );
}
