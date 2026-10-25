"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDeviceMotion } from "@/hooks/use-device-motion";
import { useMediaQuery } from "@/hooks/use-media-query";
import { detectShake, initialShakeTracker, motionSample, shakePose } from "../model/motion";

const restingPose = { tilt: 0, wave: 0, energy: 0 };
export function useShakeBlending({
  enabled,
  listening,
  onProgress,
  onActivated,
}: {
  enabled: boolean;
  listening: boolean;
  onProgress: (amount: number) => void;
  onActivated: () => void;
}) {
  const isHandheld = useMediaQuery("(max-width: 900px) and (pointer: coarse)");
  const [pose, setPose] = useState(restingPose);
  const [count, setCount] = useState(0);
  const [noSignal, setNoSignal] = useState(false);
  const tracker = useRef(initialShakeTracker());
  const seen = useRef(false);
  const lastVisual = useRef(0);
  const poseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const {
    available: supported,
    access,
    requestPermission,
    cancel,
  } = useDeviceMotion({
    enabled,
    onMotion(event) {
      if (!listening || noSignal) return;
      const sample = motionSample(event.acceleration, event.accelerationIncludingGravity);
      if (!sample) return;
      seen.current = true;
      const now = performance.now();
      if (now - lastVisual.current > 52) {
        setPose(shakePose(sample));
        lastVisual.current = now;
        clearTimeout(poseTimer.current);
        poseTimer.current = setTimeout(() => setPose(restingPose), 190);
      }
      const result = detectShake(tracker.current, sample, now);
      tracker.current = result.tracker;
      if (result.progress) {
        setCount((value) => value + 1);
        onProgress(result.progress);
      }
    },
  });
  const available = isHandheld && supported;
  useEffect(() => {
    if (!enabled || !listening || !available || access !== "active") return;
    const timer = setTimeout(() => {
      if (!seen.current) setNoSignal(true);
    }, 4500);
    return () => clearTimeout(timer);
  }, [enabled, listening, available, access]);
  useEffect(() => () => clearTimeout(poseTimer.current), [enabled]);
  const stop = useCallback(() => {
    cancel();
    clearTimeout(poseTimer.current);
    setPose(restingPose);
    setNoSignal(false);
  }, [cancel]);
  async function enable() {
    tracker.current = initialShakeTracker();
    seen.current = false;
    lastVisual.current = 0;
    setNoSignal(false);
    if (await requestPermission()) onActivated();
  }
  function reset() {
    stop();
    setCount(0);
  }
  return {
    available,
    isHandheld,
    access: noSignal && enabled ? ("unavailable" as const) : access,
    pose: enabled ? pose : restingPose,
    count,
    enable,
    stop,
    reset,
  };
}
