"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useReducer, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { blendReducer, initialBlendState, manualStir } from "@/lib/aura/blending";
import { useDeviceMotion } from "./useDeviceMotion";

const restingRod = { x: 50, y: 50, energy: 0 };
const bound = (value: number) => Math.max(12, Math.min(88, value));

export function useBlend(open: boolean) {
  const [{ mode, progress }, dispatch] = useReducer(blendReducer, initialBlendState);
  const [rod, setRod] = useState(restingRod);
  const [gestureActive, setGestureActive] = useState(false);
  const [settling, setSettling] = useState(false);
  const gesture = useRef<{ x: number; y: number; last: number } | null>(null);
  const rodUpdate = useRef(0);
  const complete = progress >= 100;
  const onShake = useCallback((amount: number) => dispatch({ type: "advance", source: "shake", amount }), []);
  const onGranted = useCallback(() => {
    gesture.current = null;
    setGestureActive(false);
    dispatch({ type: "mode", mode: "shake" });
  }, []);
  const motion = useDeviceMotion({ enabled: open && !complete, listening: mode === "shake", onShake, onGranted });

  useEffect(() => {
    if (!open || mode !== "auto" || complete) return;
    let frame = 0;
    let last = 0;
    const start = performance.now();
    const tick = (now: number) => {
      if (now - last >= 48) {
        const phase = (now - start) / 1000 * Math.PI * .70;
        setRod({ x: 50 + 24 * Math.cos(phase), y: 50 + 19 * Math.sin(phase), energy: .48 + .08 * Math.sin(phase * .5) });
        last = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const timer = setInterval(() => dispatch({ type: "advance", source: "auto", amount: 1 }), 85);
    return () => { clearInterval(timer); cancelAnimationFrame(frame); };
  }, [open, mode, complete]);

  useEffect(() => {
    if (!open || complete) {
      gesture.current = null;
      setGestureActive(false);
      setRod(current => ({ ...current, energy: 0 }));
    }
  }, [open, complete]);

  useEffect(() => {
    if ((mode !== "manual" && mode !== "shake") || rod.energy < .03) return;
    const timer = setTimeout(() => {
      setRod(current => ({ ...current, energy: 0 }));
      setGestureActive(false);
    }, 620);
    return () => clearTimeout(timer);
  }, [mode, rod]);

  useEffect(() => {
    if (!settling) return;
    const timer = setTimeout(() => { setSettling(false); setRod(current => ({ ...current, energy: 0 })); }, 950);
    return () => clearTimeout(timer);
  }, [settling]);

  function reset() {
    motion.reset();
    dispatch({ type: "reset" });
    gesture.current = null;
    rodUpdate.current = 0;
    setGestureActive(false);
    setSettling(false);
    setRod(restingRod);
  }

  function stop() {
    motion.stop();
    gesture.current = null;
    setGestureActive(false);
    setSettling(false);
  }

  function startAuto() {
    motion.stop();
    gesture.current = null;
    setGestureActive(false);
    setSettling(false);
    dispatch({ type: "mode", mode: "auto" });
  }

  function startGesture(event: PointerEvent<HTMLDivElement>) {
    if (!open || complete || mode === "auto" || mode === "shake") return;
    const rect = event.currentTarget.getBoundingClientRect();
    gesture.current = { x: event.clientX, y: event.clientY, last: performance.now() };
    dispatch({ type: "mode", mode: "manual" });
    setSettling(false);
    setGestureActive(true);
    setRod({ x: bound((event.clientX - rect.left) / rect.width * 100), y: bound((event.clientY - rect.top) / rect.height * 100), energy: .5 });
    if (event.pointerType !== "mouse") event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveGesture(event: PointerEvent<HTMLDivElement>) {
    if (!open || complete || mode !== "manual" || !gesture.current) return;
    const now = performance.now();
    if (now - rodUpdate.current < 35) return;
    rodUpdate.current = now;
    const previous = gesture.current;
    const movement = manualStir(Math.hypot(event.clientX - previous.x, event.clientY - previous.y), now - previous.last);
    gesture.current = { x: event.clientX, y: event.clientY, last: now };
    if (!movement) return;
    const rect = event.currentTarget.getBoundingClientRect();
    dispatch({ type: "advance", source: "manual", amount: movement.progress });
    setRod({ x: bound((event.clientX - rect.left) / rect.width * 100), y: bound((event.clientY - rect.top) / rect.height * 100), energy: movement.energy });
    setGestureActive(true);
    setSettling(false);
  }

  function leaveGesture() {
    gesture.current = null;
    setGestureActive(false);
    setSettling(true);
  }

  function endGesture(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse") return;
    leaveGesture();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function keyGesture(event: KeyboardEvent<HTMLDivElement>) {
    if (!open || complete || mode === "auto" || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Enter"].includes(event.key)) return;
    event.preventDefault();
    motion.stop();
    dispatch({ type: "mode", mode: "manual" });
    dispatch({ type: "advance", source: "manual", amount: 8 });
    setRod(current => ({ ...current, energy: .45, x: Math.max(35, Math.min(65, current.x + (event.key === "ArrowLeft" ? -3 : 3))) }));
  }

  return { mode, progress, complete, rod, gestureActive, settling, motion, reset, stop, startAuto, startGesture, moveGesture, endGesture, leaveGesture, keyGesture };
}

export type BlendController = ReturnType<typeof useBlend>;
