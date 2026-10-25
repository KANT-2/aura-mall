import type { AtelierState } from "@/features/atelier/model/composition";
import headerStyles from "./atelier-header.module.css";

export function AtelierHeader({
  step,
  blending,
}: {
  step: AtelierState["step"];
  blending: boolean;
}) {
  return (
    <header data-atelier-header className={headerStyles.heading}>
      <div>
        <span className="eyebrow">PERSONAL ATELIER / AURA</span>
        <h1>
          {step === "entry"
            ? "취향을 한 방울씩"
            : step === "result"
              ? "나만의 향을 기록하다"
              : "향을 만드는 시간"}
        </h1>
      </div>
      <div className={headerStyles.steps} aria-label="진행 단계">
        <span aria-current={step !== "result" && !blending ? "step" : undefined}>01 고르기</span>
        <span aria-current={blending ? "step" : undefined}>02 섞기</span>
        <span aria-current={step === "result" ? "step" : undefined}>03 기록하기</span>
      </div>
    </header>
  );
}
