"use client";
import { useCallback, useReducer } from "react";
import {
  blendReducer,
  initialBlendState,
  type BlendSnapshot,
} from "@/features/atelier/model/blending";
import { useAutomaticBlending } from "@/features/atelier/hooks/use-automatic-blending";
import { useStirGesture } from "@/features/atelier/hooks/use-stir-gesture";
import { useShakeBlending } from "@/features/atelier/hooks/use-shake-blending";

/** Coordinates mutually exclusive mixing modes; each input owns its own lifecycle. */
export function useBlend(open: boolean) {
  const [state, dispatch] = useReducer(blendReducer, initialBlendState);
  const complete = state.progress >= 100;
  const enabled = open && !complete;
  const advanceShake = useCallback(
    (amount: number) => dispatch({ type: "advance", source: "shake", amount }),
    [],
  );
  const activateShake = useCallback(() => dispatch({ type: "mode", mode: "shake" }), []);
  const advanceManual = useCallback(
    (amount: number) => dispatch({ type: "advance", source: "manual", amount }),
    [],
  );
  const advanceAutomatic = useCallback(
    (amount: number) => dispatch({ type: "advance", source: "auto", amount }),
    [],
  );
  const motion = useShakeBlending({
    enabled,
    listening: state.mode === "shake",
    onProgress: advanceShake,
    onActivated: activateShake,
  });
  const gesture = useStirGesture({
    enabled,
    mode: state.mode,
    onProgress: advanceManual,
    onStart() {
      motion.stop();
      dispatch({ type: "mode", mode: "manual" });
    },
  });
  useAutomaticBlending(enabled && state.mode === "auto", advanceAutomatic, gesture.setRod);
  const snapshot: BlendSnapshot = {
    ...state,
    complete,
    rod: gesture.rod,
    gestureActive: gesture.active,
    settling: gesture.settling,
    motion: {
      access: motion.access,
      available: motion.available,
      isHandheld: motion.isHandheld,
      pose: motion.pose,
      count: motion.count,
    },
  };
  return {
    snapshot,
    vesselEvents: gesture.handlers,
    async enableShake() {
      gesture.stop();
      await motion.enable();
    },
    reset() {
      motion.reset();
      gesture.reset();
      dispatch({ type: "reset" });
    },
    stop() {
      motion.stop();
      gesture.stop();
    },
    startAutomatic() {
      motion.stop();
      gesture.stop();
      dispatch({ type: "mode", mode: "auto" });
    },
  };
}
