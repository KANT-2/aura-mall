"use client";
import { useSyncExternalStore } from "react";
const subscribe = () => () => {};
const supported = () => typeof navigator.share === "function";
const serverSnapshot = () => false;
export function useNativeShare() {
  return useSyncExternalStore(subscribe, supported, serverSnapshot);
}
