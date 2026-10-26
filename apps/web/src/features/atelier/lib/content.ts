import type { Stage } from "@/features/atelier/model/composition";

export const stageLabels: Record<Stage, string> = {
  top: "TOP · 첫인상",
  middle: "HEART · 중심",
  base: "BASE · 잔향",
};

export const stageDescriptions: Record<Stage, string> = {
  top: "처음 마주하는 맑은 인상",
  middle: "오래 머무는 향의 중심",
  base: "마지막까지 남는 잔향",
};

export const noteEnglish: Record<Stage, string> = { top: "TOP", middle: "HEART", base: "BASE" };
