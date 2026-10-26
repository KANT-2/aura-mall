import type { Ingredient } from "@/features/catalog/model/catalog";
import { isRecord } from "@/lib/validation";

export const MAX_DROPS = 20;
const labels = new Set(["classic", "paper", "minimal"]);

export type Recipe = {
  id: string;
  parent?: string;
  version: number;
  name: string;
  label: string;
  counts: Record<string, number>;
  color: string;
  created: string;
};

export type AtelierDraft = {
  counts: Record<string, number>;
  name: string;
  label: string;
  step: "entry" | "select" | "result";
};

/** Reject invalid compositions rather than changing a user's proportions. */
export function validCounts(
  value: unknown,
  ingredients: readonly Pick<Ingredient, "id">[],
): Record<string, number> | null {
  if (!isRecord(value)) {
    return null;
  }
  const ingredientIds = new Set(ingredients.map(({ id }) => id));
  const used: [string, number][] = [];
  let total = 0;
  for (const [id, count] of Object.entries(value)) {
    if (
      !ingredientIds.has(id) ||
      typeof count !== "number" ||
      !Number.isInteger(count) ||
      count < 0
    ) {
      return null;
    }
    total += count;
    if (count > 0) {
      used.push([id, count]);
    }
  }
  return total > 0 && total <= MAX_DROPS ? Object.fromEntries(used) : null;
}

export const recipeLabel = (value: unknown): string =>
  typeof value === "string" && labels.has(value) ? value : "classic";

export const recipeColor = (value: unknown): string =>
  typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value : "#d5b575";

export function restoreRecipes(raw: unknown, ingredients: readonly Ingredient[]): Recipe[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();
  return raw.flatMap((recipe): Recipe[] => {
    if (
      !isRecord(recipe) ||
      typeof recipe.id !== "string" ||
      !recipe.id.trim() ||
      typeof recipe.name !== "string" ||
      !recipe.name.trim() ||
      seen.has(recipe.id)
    ) {
      return [];
    }
    const counts = validCounts(recipe.counts, ingredients);
    if (!counts) {
      return [];
    }
    seen.add(recipe.id);
    return [
      {
        id: recipe.id,
        parent: typeof recipe.parent === "string" ? recipe.parent : undefined,
        version:
          typeof recipe.version === "number" &&
          Number.isSafeInteger(recipe.version) &&
          recipe.version > 0
            ? recipe.version
            : 1,
        name: recipe.name.trim(),
        label: recipeLabel(recipe.label),
        counts,
        color: recipeColor(recipe.color),
        created: typeof recipe.created === "string" ? recipe.created : "",
      },
    ];
  });
}

export function restoreDraft(
  raw: unknown,
  ingredients: readonly Ingredient[],
): AtelierDraft | null {
  if (!isRecord(raw)) {
    return null;
  }
  const counts = validCounts(raw.counts, ingredients);
  if (!counts) {
    return null;
  }
  return {
    counts,
    name: typeof raw.name === "string" ? raw.name : "",
    label: recipeLabel(raw.label),
    step: raw.step === "result" ? "result" : "select",
  };
}

export const totalCount = (counts: Record<string, number>) =>
  Object.values(counts).reduce((a, b) => a + b, 0);

export function mixColor(counts: Record<string, number>, ingredients: readonly Ingredient[]) {
  const total = totalCount(counts);
  if (!total) {
    return "#d5b575";
  }
  const sum = [0, 0, 0];
  ingredients.forEach((i) => {
    const n = counts[i.id] || 0;
    for (let c = 0; c < 3; c++) {
      sum[c] += parseInt(i.color.slice(1 + c * 2, 3 + c * 2), 16) * n;
    }
  });
  return (
    "#" +
    sum
      .map((v) =>
        Math.round(v / total)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

export type CustomComposition = {
  name: string;
  label: string;
  color: string;
  counts: Record<string, number>;
  recipeKey?: string;
  productType?: string;
};
