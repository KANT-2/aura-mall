"use client";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

export type MotionPermission = "idle" | "requesting" | "active" | "denied" | "unavailable";
type MotionConstructor = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};
const subscribe = () => () => {};
const supported = () => window.isSecureContext && typeof window.DeviceMotionEvent !== "undefined";
const serverSnapshot = () => false;

/** Browser permissions and event subscription only; no fragrance or blending rules. */
export function useDeviceMotion({
  enabled,
  onMotion,
}: {
  enabled: boolean;
  onMotion: (event: DeviceMotionEvent) => void;
}) {
  const available = useSyncExternalStore(subscribe, supported, serverSnapshot);
  const [permission, setPermission] = useState<MotionPermission>("idle");
  const requestId = useRef(0);
  const onReading = useEffectEvent(onMotion);
  useEffect(
    () => () => {
      requestId.current++;
    },
    [enabled],
  );
  useEffect(() => {
    if (!enabled || permission !== "active" || !available) return;
    const listener = (event: DeviceMotionEvent) => onReading(event);
    window.addEventListener("devicemotion", listener, { passive: true });
    return () => window.removeEventListener("devicemotion", listener);
  }, [enabled, permission, available]);

  const cancel = useCallback(() => {
    requestId.current++;
    setPermission("idle");
  }, []);
  async function requestPermission() {
    if (!enabled) return false;
    if (!supported()) {
      setPermission("unavailable");
      return false;
    }
    const token = ++requestId.current;
    setPermission("requesting");
    try {
      const constructor = window.DeviceMotionEvent as MotionConstructor;
      // Keep this call in the original click event for iOS user activation.
      const result = constructor.requestPermission
        ? await constructor.requestPermission()
        : "granted";
      if (token !== requestId.current) return false;
      setPermission(result === "granted" ? "active" : "denied");
      return result === "granted";
    } catch {
      if (token === requestId.current) setPermission("denied");
      return false;
    }
  }
  return {
    available,
    access: enabled ? permission : ("idle" as MotionPermission),
    requestPermission,
    cancel,
  };
}
