"use client";
import {
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { manualStir, type BlendMode, type StirPose } from "../model/blending";

const restingRod: StirPose = { x: 50, y: 50, energy: 0 };
const bound = (value: number) => Math.max(12, Math.min(88, value));
export function useStirGesture({
  enabled,
  mode,
  onStart,
  onProgress,
}: {
  enabled: boolean;
  mode: BlendMode;
  onStart: () => void;
  onProgress: (amount: number) => void;
}) {
  const [rod, setRod] = useState(restingRod);
  const [active, setActive] = useState(false);
  const [settling, setSettling] = useState(false);
  const gesture = useRef<{ x: number; y: number; last: number } | null>(null);
  const lastUpdate = useRef(0);
  useEffect(() => {
    if (!enabled || mode !== "manual" || rod.energy < 0.03) return;
    const timer = setTimeout(() => {
      setRod((current) => ({ ...current, energy: 0 }));
      setActive(false);
    }, 620);
    return () => clearTimeout(timer);
  }, [enabled, mode, rod]);
  useEffect(() => {
    if (!enabled || !settling) return;
    const timer = setTimeout(() => {
      setSettling(false);
      setRod((current) => ({ ...current, energy: 0 }));
    }, 950);
    return () => clearTimeout(timer);
  }, [enabled, settling]);
  function stop() {
    gesture.current = null;
    setActive(false);
    setSettling(false);
  }
  function reset() {
    stop();
    lastUpdate.current = 0;
    setRod(restingRod);
  }
  function start(event: PointerEvent<HTMLDivElement>) {
    if (!enabled || mode === "auto" || mode === "shake") return;
    const rect = event.currentTarget.getBoundingClientRect();
    gesture.current = { x: event.clientX, y: event.clientY, last: performance.now() };
    onStart();
    setSettling(false);
    setActive(true);
    setRod({
      x: bound(((event.clientX - rect.left) / rect.width) * 100),
      y: bound(((event.clientY - rect.top) / rect.height) * 100),
      energy: 0.5,
    });
    if (event.pointerType !== "mouse") event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!enabled || mode !== "manual" || !gesture.current) return;
    const now = performance.now();
    if (now - lastUpdate.current < 35) return;
    lastUpdate.current = now;
    const previous = gesture.current;
    const movement = manualStir(
      Math.hypot(event.clientX - previous.x, event.clientY - previous.y),
      now - previous.last,
    );
    gesture.current = { x: event.clientX, y: event.clientY, last: now };
    if (!movement) return;
    const rect = event.currentTarget.getBoundingClientRect();
    onProgress(movement.progress);
    setRod({
      x: bound(((event.clientX - rect.left) / rect.width) * 100),
      y: bound(((event.clientY - rect.top) / rect.height) * 100),
      energy: movement.energy,
    });
    setActive(true);
    setSettling(false);
  }
  function leave() {
    if (!enabled || mode !== "manual") return;
    gesture.current = null;
    setActive(false);
    setSettling(true);
  }
  function end(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse") return;
    leave();
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function key(event: KeyboardEvent<HTMLDivElement>) {
    if (
      !enabled ||
      mode === "auto" ||
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Enter"].includes(event.key)
    )
      return;
    event.preventDefault();
    onStart();
    onProgress(8);
    setRod((current) => ({
      ...current,
      energy: 0.45,
      x: Math.max(35, Math.min(65, current.x + (event.key === "ArrowLeft" ? -3 : 3))),
    }));
  }
  const handlers: HTMLAttributes<HTMLDivElement> = {
    onKeyDown: key,
    onPointerDown: start,
    onPointerMove: move,
    onPointerUp: end,
    onPointerCancel: end,
    onPointerLeave: leave,
  };
  return {
    rod: enabled ? rod : { ...rod, energy: 0 },
    active: enabled && active,
    settling: enabled && settling,
    handlers,
    setRod,
    stop,
    reset,
  };
}
