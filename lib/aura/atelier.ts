import ingredients from "../../data/ingredients.json";
import { MAX_DROPS, recipeLabel, restoreDraft, totalCount, type AtelierDraft, type Recipe } from "./recipes";

export type Stage = "top" | "middle" | "base";
export const stageOrder: Stage[] = ["top", "middle", "base"];

export type AtelierState = AtelierDraft & {
  tab: Stage;
  recommended: string[];
  parent?: Recipe;
  saved: boolean;
  cartAdded: boolean;
  drop: number;
};

export function initialAtelierState(): AtelierState {
  return { step: "entry", counts: {}, name: "", label: "classic", tab: "top", recommended: [], saved: false, cartAdded: false, drop: 0 };
}

export type AtelierAction =
  | { type: "select"; recommended?: string[] }
  | { type: "tab"; tab: Stage }
  | { type: "add" | "decrease" | "remove"; id: string }
  | { type: "name" | "label"; value: string }
  | { type: "restore"; draft: AtelierDraft; parent?: Recipe }
  | { type: "finish"; complete: boolean }
  | { type: "edit" | "clear" | "reset" | "saved" | "cart-added" };

/** All composition changes invalidate saved/cart confirmation in the same transition. */
export function atelierReducer(state: AtelierState, action: AtelierAction): AtelierState {
  switch (action.type) {
    case "select":
      return { ...state, step: "select", tab: "top", recommended: action.recommended?.filter(id => ingredients.some(note => note.id === id)) ?? [] };
    case "tab":
      return { ...state, tab: action.tab };
    case "add": {
      if (state.step !== "select" || totalCount(state.counts) >= MAX_DROPS || !ingredients.some(note => note.id === action.id)) return state;
      return { ...state, counts: { ...state.counts, [action.id]: (state.counts[action.id] || 0) + 1 }, saved: false, cartAdded: false, drop: state.drop + 1 };
    }
    case "decrease":
    case "remove": {
      if (state.step !== "select" || !Object.prototype.hasOwnProperty.call(state.counts, action.id)) return state;
      const counts = { ...state.counts };
      if (action.type === "remove" || counts[action.id] <= 1) delete counts[action.id];
      else counts[action.id]--;
      return { ...state, counts, saved: false, cartAdded: false };
    }
    case "name":
      return { ...state, name: action.value, saved: false, cartAdded: false };
    case "label":
      return { ...state, label: recipeLabel(action.value), saved: false, cartAdded: false };
    case "restore": {
      const draft = restoreDraft(action.draft);
      if (!draft) return state;
      return { ...initialAtelierState(), ...draft, step: action.parent ? "select" : draft.step, parent: action.parent };
    }
    case "finish":
      return action.complete && totalCount(state.counts) > 0 ? { ...state, step: "result" } : state;
    case "edit":
      return { ...state, step: "select", saved: false, cartAdded: false };
    case "clear":
      return { ...state, counts: {}, drop: 0, saved: false, cartAdded: false };
    case "saved":
      return { ...state, saved: true };
    case "cart-added":
      return { ...state, cartAdded: true };
    case "reset":
      return initialAtelierState();
  }
}

/** Largest-remainder allocation keeps displayed percentages at exactly 100. */
export function percentages(counts: Record<string, number>): Record<string, number> {
  const entries = Object.entries(counts).filter(([, count]) => Number.isFinite(count) && count > 0);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (!total) return {};
  const sorted = entries.map(([id, count]) => ({ id, exact: count * 100 / total, value: Math.floor(count * 100 / total) }));
  let left = 100 - sorted.reduce((sum, entry) => sum + entry.value, 0);
  sorted.sort((a, b) => (b.exact - b.value) - (a.exact - a.value) || a.id.localeCompare(b.id));
  for (const entry of sorted) if (left-- > 0) entry.value++;
  return Object.fromEntries(sorted.map(({ id, value }) => [id, value]));
}

export function stageRatiosForNames(counts: Record<string, number>): "fresh" | "soft" | "warm" {
  const top = ingredients.filter(note => note.stage === "top").reduce((sum, note) => sum + (counts[note.id] || 0), 0);
  const heart = ingredients.filter(note => note.stage === "middle").reduce((sum, note) => sum + (counts[note.id] || 0), 0);
  const base = totalCount(counts) - top - heart;
  return base > top && base >= heart ? "warm" : heart > top ? "soft" : "fresh";
}
