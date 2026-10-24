"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useReducer, useRef, useState } from "react";
import { atelierReducer, initialAtelierState } from "@/lib/aura/atelier";
import { atelierStore } from "@/lib/aura/atelier-store";
import { totalCount, type AtelierDraft, type Recipe } from "@/lib/aura/recipes";

export function useComposition(recipes: Recipe[]) {
  const [state, dispatch] = useReducer(atelierReducer, undefined, initialAtelierState);
  const [ready, setReady] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<AtelierDraft | null>(null);
  const loadedRecipe = useRef<string | null>(null);
  const { counts, name, label, step } = state;

  useEffect(() => {
    const draft = atelierStore.load();
    setPendingDraft(draft);
    // Ordinary visits start at entry; login's explicit resume may restore the result.
    if (new URLSearchParams(window.location.search).has("resume") && draft) {
      dispatch({ type: "restore", draft });
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const id = new URLSearchParams(window.location.search).get("recipe");
    const recipe = recipes.find(item => item.id === id);
    if (!recipe || loadedRecipe.current === recipe.id) return;
    loadedRecipe.current = recipe.id;
    dispatch({ type: "restore", draft: { ...recipe, step: "select" }, parent: recipe });
  }, [recipes, ready]);

  useEffect(() => {
    if (!ready) return;
    if (totalCount(counts)) {
      atelierStore.save({ counts, name, label, step });
    } else if (!pendingDraft) atelierStore.clear();
  }, [counts, name, label, step, ready, pendingDraft]);

  function resumeDraft() {
    if (pendingDraft) dispatch({ type: "restore", draft: { ...pendingDraft, step: "select" } });
  }

  function reset() {
    dispatch({ type: "reset" });
    setPendingDraft(null);
    atelierStore.clear();
  }

  return { state, dispatch, pendingDraft, resumeDraft, reset };
}
