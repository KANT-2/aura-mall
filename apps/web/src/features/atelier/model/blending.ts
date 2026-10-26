export type BlendMode = "ready" | "manual" | "shake" | "auto" | "done";
export type BlendState = { mode: BlendMode; progress: number };
export const initialBlendState: BlendState = { mode: "ready", progress: 0 };
export type BlendAction =
  | { type: "reset" }
  | { type: "mode"; mode: "manual" | "shake" | "auto" }
  | { type: "advance"; source: "manual" | "shake" | "auto"; amount: number };

export function blendReducer(state: BlendState, action: BlendAction): BlendState {
  if (action.type === "reset") {
    return initialBlendState;
  }

  if (state.mode === "done") {
    return state;
  }

  if (action.type === "mode") {
    return { ...state, mode: action.mode };
  }

  if (action.source !== state.mode || !Number.isFinite(action.amount) || action.amount <= 0) {
    return state;
  }

  const limit = action.source === "auto" ? 1 : action.source === "shake" ? 9 : 8;
  const progress = Math.min(100, state.progress + Math.min(limit, action.amount));
  return { progress, mode: progress >= 100 ? "done" : state.mode };
}

export function manualStir(distance: number, elapsed: number) {
  if (!Number.isFinite(distance) || !Number.isFinite(elapsed) || distance < 3) {
    return null;
  }

  return {
    progress: Math.min(1.4, distance * 0.023),
    energy: Math.min(0.85, Math.max(0.1, (distance / Math.max(18, elapsed)) * 1.3)),
  };
}

export type StirPose = { x: number; y: number; energy: number };
export type BlendSnapshot = BlendState & {
  complete: boolean;
  rod: StirPose;
  gestureActive: boolean;
  settling: boolean;
  motion: {
    access: "idle" | "requesting" | "active" | "denied" | "unavailable";
    available: boolean;
    isHandheld: boolean;
    pose: { tilt: number; wave: number; energy: number };
    count: number;
  };
};
