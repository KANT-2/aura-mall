import type { Ingredient } from "@/features/catalog/model/catalog";
import {
  MAX_DROPS,
  recipeLabel,
  restoreDraft,
  totalCount,
  type AtelierDraft,
  type Recipe,
} from "@/features/atelier/model/recipes";

export type Stage = "top" | "middle" | "base";
export const stageOrder: Stage[] = ["top", "middle", "base"];

export type AtelierState = AtelierDraft & {
  revision: number;
  tab: Stage;
  recommended: string[];
  parent?: Recipe;
  saved: boolean;
  cartAdded: boolean;
  drop: number;
};

export function initialAtelierState(): AtelierState {
  return {
    revision: 0,
    step: "entry",
    counts: {},
    name: "",
    label: "classic",
    tab: "top",
    recommended: [],
    saved: false,
    cartAdded: false,
    drop: 0,
  };
}

export type AtelierAction =
  | { type: "select"; recommended?: string[] }
  | { type: "tab"; tab: Stage }
  | { type: "add" | "decrease" | "remove"; id: string }
  | { type: "name" | "label"; value: string }
  | { type: "restore"; draft: AtelierDraft; parent?: Recipe }
  | { type: "finish"; complete: boolean }
  | { type: "edit" | "clear" | "reset" }
  | { type: "saved" | "cart-added"; revision: number };

/** All composition changes invalidate saved/cart confirmation in the same transition. */
export function atelierReducer(
  state: AtelierState,
  action: AtelierAction,
  ingredients: readonly Ingredient[],
): AtelierState {
  switch (action.type) {
    case "select":
      return {
        ...state,
        revision: state.revision + 1,
        step: "select",
        tab: "top",
        recommended:
          action.recommended?.filter((id) => ingredients.some((note) => note.id === id)) ?? [],
      };
    case "tab":
      return { ...state, revision: state.revision + 1, tab: action.tab };
    case "add": {
      if (
        state.step !== "select" ||
        totalCount(state.counts) >= MAX_DROPS ||
        !ingredients.some((note) => note.id === action.id)
      )
        return state;
      return {
        ...state,
        revision: state.revision + 1,
        counts: { ...state.counts, [action.id]: (state.counts[action.id] || 0) + 1 },
        saved: false,
        cartAdded: false,
        drop: state.drop + 1,
      };
    }
    case "decrease":
    case "remove": {
      if (state.step !== "select" || !Object.prototype.hasOwnProperty.call(state.counts, action.id))
        return state;
      const counts = { ...state.counts };
      if (action.type === "remove" || counts[action.id] <= 1) delete counts[action.id];
      else counts[action.id]--;
      return { ...state, revision: state.revision + 1, counts, saved: false, cartAdded: false };
    }
    case "name":
      return {
        ...state,
        revision: state.revision + 1,
        name: action.value,
        saved: false,
        cartAdded: false,
      };
    case "label":
      return {
        ...state,
        revision: state.revision + 1,
        label: recipeLabel(action.value),
        saved: false,
        cartAdded: false,
      };
    case "restore": {
      const draft = restoreDraft(action.draft, ingredients);
      if (!draft) return state;
      return {
        ...initialAtelierState(),
        ...draft,
        revision: state.revision + 1,
        step: action.parent ? "select" : draft.step,
        parent: action.parent,
      };
    }
    case "finish":
      return action.complete && totalCount(state.counts) > 0
        ? { ...state, revision: state.revision + 1, step: "result" }
        : state;
    case "edit":
      return {
        ...state,
        revision: state.revision + 1,
        step: "select",
        saved: false,
        cartAdded: false,
      };
    case "clear":
      return {
        ...state,
        revision: state.revision + 1,
        counts: {},
        drop: 0,
        saved: false,
        cartAdded: false,
      };
    case "saved":
      return state.revision === action.revision && state.step === "result"
        ? { ...state, saved: true }
        : state;
    case "cart-added":
      return state.revision === action.revision && state.step === "result"
        ? { ...state, cartAdded: true }
        : state;
    case "reset":
      return { ...initialAtelierState(), revision: state.revision + 1 };
  }
}

/** Largest-remainder allocation keeps displayed percentages at exactly 100. */
export function percentages(counts: Record<string, number>): Record<string, number> {
  const entries = Object.entries(counts).filter(([, count]) => Number.isFinite(count) && count > 0);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (!total) return {};
  const sorted = entries.map(([id, count]) => ({
    id,
    exact: (count * 100) / total,
    value: Math.floor((count * 100) / total),
  }));
  let left = 100 - sorted.reduce((sum, entry) => sum + entry.value, 0);
  sorted.sort((a, b) => b.exact - b.value - (a.exact - a.value) || a.id.localeCompare(b.id));
  for (const entry of sorted) if (left-- > 0) entry.value++;
  return Object.fromEntries(sorted.map(({ id, value }) => [id, value]));
}

export function stageRatiosForNames(
  counts: Record<string, number>,
  ingredients: readonly Ingredient[],
): "fresh" | "soft" | "warm" {
  const top = ingredients
    .filter((note) => note.stage === "top")
    .reduce((sum, note) => sum + (counts[note.id] || 0), 0);
  const heart = ingredients
    .filter((note) => note.stage === "middle")
    .reduce((sum, note) => sum + (counts[note.id] || 0), 0);
  const base = totalCount(counts) - top - heart;
  return base > top && base >= heart ? "warm" : heart > top ? "soft" : "fresh";
}
