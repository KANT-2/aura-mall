"use client";
import { testIds } from "@/lib/test-ids";
import blendStyles from "@/features/atelier/components/blend-experience.module.css";
import mixingVesselStyles from "@/features/atelier/components/mixing-vessel.module.css";
import type { CSSProperties, HTMLAttributes } from "react";
import type { Ingredient } from "@/features/catalog/model/catalog";
import { MAX_DROPS } from "@/features/atelier/model/recipes";
import { Asset } from "@/components/ui/asset";
import { Beaker } from "@/components/illustrations/beaker";
import { UtilityIcon } from "@/components/ui/utility-icon";
import type { BlendSnapshot } from "@/features/atelier/model/blending";

export function BlendExperience({
  state,
  vesselEvents,
  onStartAutomatic,
  onEnableShake,
  total,
  color,
  ranked,
  onFinish: enterResult,
}: {
  state: BlendSnapshot;
  vesselEvents: HTMLAttributes<HTMLDivElement>;
  onStartAutomatic: () => void;
  onEnableShake: () => Promise<void>;
  total: number;
  color: string;
  ranked: Ingredient[];
  onFinish: () => void;
}) {
  const {
    mode: blendMode,
    progress,
    complete: blendComplete,
    rod,
    gestureActive,
    settling,
    motion,
  } = state;
  const {
    access: motionAccess,
    available: motionAvailable,
    isHandheld,
    pose: shakePose,
    count: shakeUiCount,
  } = motion;
  const liquidY = 270 - Math.min(MAX_DROPS, total) * 6;
  const mixHint =
    progress < 30
      ? "톡톡 눌러 보거나 천천히 저어 보세요"
      : progress < 75
        ? "막대를 움직이면 액체가 따라와요"
        : "액체가 차분하게 어우러졌어요";
  return (
    <div data-atelier-part="blend" className={blendStyles.experience}>
      <div data-atelier-part="blend-stage" className={blendStyles.stage}>
        <span className="eyebrow">
          {blendComplete ? "YOUR SCENT / COMPLETED" : "THE ART OF BLENDING"}
        </span>

        <div
          data-testid={testIds.atelier.slider}
          data-mixing-mode={blendMode}
          className={`${mixingVesselStyles.beaker}   ${blendMode === "shake" ? `${mixingVesselStyles.shake}` : ""}  ${gestureActive ? `${mixingVesselStyles.dragging}` : settling ? `${mixingVesselStyles.settling}` : ""}`}
          role="slider"
          tabIndex={blendComplete ? -1 : 0}
          aria-label="비커를 클릭하거나 막대를 부드럽게 움직여 향 섞기"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          style={
            {
              "--stir-progress": `${progress}%`,
              "--rod-x": `${rod.x}%`,
              "--rod-y": `${rod.y}%`,
              "--stir-energy": rod.energy,
              "--shake-tilt": `${shakePose.tilt}deg`,
            } as CSSProperties
          }
          {...vesselEvents}
        >
          <Beaker
            count={total}
            color={color}
            mixing={false}
            stir={
              blendMode === "shake"
                ? {
                    x: 50,
                    y: 50,
                    energy: shakePose.energy,
                    tilt: shakePose.tilt,
                    wave: shakePose.wave,
                    mode: "shake",
                  }
                : { ...rod, mode: blendMode === "auto" ? "auto" : "manual" }
            }
          />
          <svg
            className={mixingVesselStyles.rodLayer}
            viewBox="0 0 360 360"
            aria-hidden="true"
            focusable="false"
          >
            <defs>
              <linearGradient id="mixing-rod-glass" x1="0" x2="1">
                <stop offset="0" stopColor="#b2b8ac" stopOpacity=".3" />
                <stop offset=".28" stopColor="#fffdf6" stopOpacity=".94" />
                <stop offset=".64" stopColor="#d1ded8" stopOpacity=".55" />
                <stop offset="1" stopColor="#fffdfa" stopOpacity=".83" />
              </linearGradient>
            </defs>
            <g
              className={mixingVesselStyles.rod}
              style={{
                transform: `translate(${(rod.x - 50) * 0.8}px,${(rod.y - 50) * 0.28}px) rotate(${(rod.x - 50) * 0.05}deg)`,
                transformOrigin: "180px 205px",
              }}
            >
              <path
                d={`M180 25 L177 ${liquidY + 10} Q176 ${liquidY + 17} 181 ${liquidY + 17} Q186 ${liquidY + 17} 185 ${liquidY + 10} L183 25 Z`}
                fill="url(#mixing-rod-glass)"
                stroke="#c4c0b4"
                strokeWidth="1.4"
              />
              <path
                d={`M180 33 L179 ${liquidY + 8}`}
                stroke="#fff"
                strokeOpacity=".72"
                strokeWidth="1.4"
              />
            </g>
            <ellipse
              className={mixingVesselStyles.ripple}
              cx={180 + (rod.x - 50) * 0.8}
              cy={liquidY + (rod.y - 50) * 0.28}
              rx={21 + rod.energy * 8}
              ry={3 + rod.energy * 2}
              fill="none"
              stroke="#fff5db"
              strokeWidth="1.6"
              style={{ opacity: rod.energy * 0.52 }}
            />
          </svg>
        </div>
        <div className={mixingVesselStyles.light} aria-hidden="true" />
      </div>
      <div data-blend-copy className={blendStyles.copy} aria-live="polite">
        <h3>
          {blendComplete
            ? "서로 다른 향이 하나로 어우러졌어요."
            : blendMode === "ready"
              ? "이제 향을 천천히 섞어 볼까요?"
              : "한 방울씩, 당신의 향이 완성되고 있어요."}
        </h3>
        <p>
          {blendComplete
            ? "고른 향료의 조화에 이름을 붙여 주세요."
            : blendMode === "ready"
              ? "비커를 클릭한 뒤 마우스를 천천히 움직여 보세요. 누르고 있을 필요는 없어요."
              : "유리 막대의 움직임을 따라 작은 잔물결이 생겨요. 서두르지 않아도 괜찮아요."}
        </p>
      </div>
      {!blendComplete ? (
        <>
          <div className={blendStyles.layout}>
            <div
              data-atelier-part="blend-surface"
              className={blendStyles.surface}
              aria-hidden="true"
            >
              <span
                className={blendStyles.outline}
                style={{ "--stir-progress": `${progress}%` } as CSSProperties}
              />
              <span className={blendStyles.instruction}>GENTLE STIR</span>
              <span className={blendStyles.percent}>{Math.round(progress)}%</span>
            </div>
            <div className={blendStyles.actions}>
              <strong>
                {blendMode === "ready" ? "나만의 조향 방식" : "당신의 조합을 만드는 중"}
              </strong>
              <p>
                {isHandheld
                  ? "비커를 손가락으로 천천히 저어 보세요. 센서 사용이 가능한 휴대폰은 흔들어 섞을 수도 있어요."
                  : "비커를 클릭한 뒤 마우스를 천천히 원형으로 움직여 보세요."}
              </p>
              <div className={blendStyles.controls}>
                {motionAvailable && (
                  <button
                    type="button"
                    data-testid={testIds.atelier.sensor}
                    data-state={motionAccess}
                    className={blendStyles.sensor}
                    onClick={onEnableShake}
                    disabled={motionAccess === "requesting" || motionAccess === "active"}
                    aria-pressed={motionAccess === "active"}
                  >
                    {motionAccess === "active"
                      ? `휴대폰 흔들기 인식 중${shakeUiCount ? ` · ${shakeUiCount}회` : ""}`
                      : motionAccess === "requesting"
                        ? "센서 권한 확인 중…"
                        : motionAccess === "denied"
                          ? "흔들기 권한 다시 요청"
                          : motionAccess === "unavailable"
                            ? "센서 확인 후 다시 시도"
                            : "휴대폰 흔들기 켜기"}
                  </button>
                )}
                <button
                  type="button"
                  data-testid={testIds.atelier.automatic}
                  className={`button ${blendStyles.auto}`}
                  onClick={onStartAutomatic}
                  disabled={blendMode === "auto"}
                >
                  {blendMode === "auto" ? "천천히 섞이는 중…" : "자동으로 섞기 · 약 9초"}
                  <UtilityIcon name="arrow" />
                </button>
              </div>
              <small className={blendStyles.sensorStatus} role="status">
                {!isHandheld
                  ? "마우스로 직접 저어 보거나 자동 혼합을 선택하세요."
                  : !motionAvailable
                    ? "센서가 없는 환경에서도 터치·자동 섞기를 사용할 수 있어요."
                    : motionAccess === "active"
                      ? "흔들기 활성화됨 · 가볍게 좌우로 흔들어 주세요."
                      : motionAccess === "denied"
                        ? "권한이 없어도 터치나 자동 섞기로 계속할 수 있어요."
                        : motionAccess === "unavailable"
                          ? "센서 신호를 받지 못했어요. 터치나 자동 섞기를 이용해 주세요."
                          : "첫 이용 시 센서 사용을 허용하면 이후 허용 상태를 기억해요."}
              </small>
              <small className={blendStyles.hint}>
                {blendMode === "auto"
                  ? "향료가 부드럽게 어우러지는 중이에요"
                  : `${mixHint} · 방향키로도 조작 가능`}
              </small>
            </div>
          </div>
          <div className={blendStyles.progress}>
            <div
              role="progressbar"
              aria-label="블렌딩 진행"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
            >
              <span style={{ width: `${progress}%` }} />
            </div>
            <small>BLENDING / {Math.round(progress)}%</small>
          </div>
        </>
      ) : (
        <>
          <div className={blendStyles.finished}>
            {ranked.slice(0, 3).map((n) => (
              <span key={n.id}>
                <Asset kind="ingredient" id={n.id} />
                {n.name}
              </span>
            ))}
          </div>
          <button
            data-testid={testIds.atelier.finish}
            className={`button ${blendStyles.finish}`}
            onClick={enterResult}
          >
            이 향에 이름 붙이기 <UtilityIcon name="arrow" />
          </button>
        </>
      )}
    </div>
  );
}
