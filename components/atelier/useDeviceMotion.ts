"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useRef, useState } from "react";
import { detectShake, initialShakeTracker, motionSample, shakePose } from "@/lib/aura/motion";

type MotionAccess = "idle" | "requesting" | "active" | "denied" | "unavailable";
type MotionWithPermission = typeof DeviceMotionEvent & { requestPermission?: () => Promise<"granted" | "denied"> };
const restingPose = { tilt: 0, wave: 0, energy: 0 };

export function useDeviceMotion({ enabled, listening, onShake, onGranted }: {
  enabled: boolean;
  listening: boolean;
  onShake: (amount: number) => void;
  onGranted: () => void;
}) {
  const [access, setAccess] = useState<MotionAccess>("idle");
  const [isHandheld, setIsHandheld] = useState(false);
  const [supported, setSupported] = useState(false);
  const [pose, setPose] = useState(restingPose);
  const [count, setCount] = useState(0);
  const request = useRef(0);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px) and (pointer: coarse)");
    const refresh = () => setIsHandheld(media.matches);
    refresh();
    setSupported(window.isSecureContext && typeof window.DeviceMotionEvent !== "undefined");
    media.addEventListener("change", refresh);
    return () => media.removeEventListener("change", refresh);
  }, []);

  const cancelRequest = useCallback(() => { request.current++; }, []);
  const stop = useCallback(() => {
    cancelRequest();
    setAccess("idle");
    setPose(restingPose);
  }, [cancelRequest]);

  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) stop();
    return cancelRequest;
  }, [enabled, stop, cancelRequest]);

  // Called synchronously from the button handler, preserving iOS user activation.
  async function enable() {
    if (!enabledRef.current) return;
    if (!window.isSecureContext || typeof window.DeviceMotionEvent === "undefined") {
      setAccess("unavailable");
      return;
    }
    const token = ++request.current;
    setAccess("requesting");
    try {
      const constructor = window.DeviceMotionEvent as MotionWithPermission;
      const result = typeof constructor.requestPermission === "function" ? await constructor.requestPermission() : "granted";
      if (token !== request.current || !enabledRef.current) return;
      if (result !== "granted") {
        setAccess("denied");
        return;
      }
      setAccess("active");
      onGranted();
    } catch {
      if (token === request.current && enabledRef.current) setAccess("denied");
    }
  }

  const available = isHandheld && supported;
  useEffect(() => {
    if (!enabled || !listening || !available || access !== "active") return;
    let tracker = initialShakeTracker();
    let seen = false;
    let lastVisual = 0;
    let resetPose: ReturnType<typeof setTimeout> | undefined;
    const onMotion = (event: DeviceMotionEvent) => {
      const sample = motionSample(event.acceleration, event.accelerationIncludingGravity);
      if (!sample) return;
      seen = true;
      const now = performance.now();
      if (now - lastVisual > 52) {
        setPose(shakePose(sample));
        lastVisual = now;
        clearTimeout(resetPose);
        resetPose = setTimeout(() => setPose(restingPose), 190);
      }
      const result = detectShake(tracker, sample, now);
      tracker = result.tracker;
      if (result.progress) {
        setCount(value => value + 1);
        onShake(result.progress);
      }
    };
    window.addEventListener("devicemotion", onMotion, { passive: true });
    const timeout = setTimeout(() => { if (!seen) setAccess("unavailable"); }, 4500);
    return () => {
      window.removeEventListener("devicemotion", onMotion);
      clearTimeout(timeout);
      clearTimeout(resetPose);
      setPose(restingPose);
    };
  }, [enabled, listening, available, access, onShake]);

  const reset = useCallback(() => { stop(); setCount(0); }, [stop]);
  return { access, available, isHandheld, pose, count, enable, stop, reset };
}
