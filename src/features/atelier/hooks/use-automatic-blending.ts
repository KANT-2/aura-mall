"use client";
import { useEffect } from "react";
import type { StirPose } from "@/features/atelier/model/blending";

export function useAutomaticBlending(
  enabled: boolean,
  onProgress: (amount: number) => void,
  onRod: (pose: StirPose) => void,
) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    let frame = 0;
    let last = 0;
    const start = performance.now();
    const tick = (now: number) => {
      if (now - last >= 48) {
        const phase = ((now - start) / 1000) * Math.PI * 0.7;
        onRod({
          x: 50 + 24 * Math.cos(phase),
          y: 50 + 19 * Math.sin(phase),
          energy: 0.48 + 0.08 * Math.sin(phase * 0.5),
        });
        last = now;
      }

      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const timer = setInterval(() => onProgress(1), 85);
    return () => {
      clearInterval(timer);
      cancelAnimationFrame(frame);
    };
  }, [enabled, onProgress, onRod]);
}
