"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { totalCount, type AtelierDraft } from "@/features/atelier/model/recipes";
import type { AtelierState } from "@/features/atelier/model/composition";

/** Debounce user edits; flush navigation and explicitly discard before deleting a draft. */
export function useDraftAutosave(
  { counts, name, label, step, revision }: AtelierState,
  persist: (draft: AtelierDraft | null) => void,
) {
  const [initialRevision] = useState(revision);
  const pending = useRef<AtelierDraft | null | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    pending.current = undefined;
  }, []);
  useEffect(() => {
    if (revision <= initialRevision || step === "entry") {
      pending.current = undefined;
      return;
    }
    pending.current = totalCount(counts) > 0 ? { counts, name, label, step } : null;
    timer.current = setTimeout(() => {
      if (pending.current !== undefined) {
        persist(pending.current);
      }
      pending.current = undefined;
    }, 250);
    return () => clearTimeout(timer.current);
  }, [counts, name, label, step, revision, initialRevision, persist]);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (pending.current !== undefined) {
        persist(pending.current);
      }
      pending.current = undefined;
    },
    [persist],
  );
  return { cancel };
}
