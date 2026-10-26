"use client";
import { useReducer, useState } from "react";
import type { Ingredient } from "@/features/catalog/model/catalog";
import {
  atelierReducer,
  initialAtelierState,
  type AtelierState,
  type AtelierAction,
} from "@/features/atelier/model/composition";
import type { AtelierDraft, Recipe } from "@/features/atelier/model/recipes";

type InitialComposition = {
  ingredients: Ingredient[];
  draft: AtelierDraft | null;
  recipe?: Recipe;
  resume: boolean;
};
export function useComposition({ ingredients, draft, recipe, resume }: InitialComposition) {
  const [state, dispatch] = useReducer(
    (state: AtelierState, action: AtelierAction) => atelierReducer(state, action, ingredients),
    undefined,
    () => {
      const empty = initialAtelierState();
      if (recipe)
        return atelierReducer(
          empty,
          { type: "restore", draft: { ...recipe, step: "select" }, parent: recipe },
          ingredients,
        );
      if (resume && draft) return atelierReducer(empty, { type: "restore", draft }, ingredients);
      return empty;
    },
  );
  const [pendingDraft, setPendingDraft] = useState(draft);
  return {
    state,
    pendingDraft,
    select: (recommended: string[] = []) => dispatch({ type: "select", recommended }),
    changeTab: (tab: "top" | "middle" | "base") => dispatch({ type: "tab", tab }),
    add: (id: string) => dispatch({ type: "add", id }),
    decrease: (id: string) => dispatch({ type: "decrease", id }),
    remove: (id: string) => dispatch({ type: "remove", id }),
    rename: (value: string) => dispatch({ type: "name", value }),
    changeLabel: (value: string) => dispatch({ type: "label", value }),
    clear: () => dispatch({ type: "clear" }),
    edit: () => dispatch({ type: "edit" }),
    finish: (complete: boolean) => dispatch({ type: "finish", complete }),
    markSaved: (revision: number) => dispatch({ type: "saved", revision }),
    markCartAdded: (revision: number) => dispatch({ type: "cart-added", revision }),
    resumeDraft() {
      if (pendingDraft) dispatch({ type: "restore", draft: { ...pendingDraft, step: "select" } });
    },
    reset() {
      setPendingDraft(null);
      dispatch({ type: "reset" });
    },
  };
}
