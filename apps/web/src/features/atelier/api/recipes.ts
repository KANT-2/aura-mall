import { request } from "@/lib/api/client";
import type { Recipe } from "@/features/atelier/model/recipes";
export type RecipeInput = Pick<Recipe, "name" | "label" | "counts" | "parent">;
export const recipesKey = (owner?: string) => ["recipes", owner] as const;
export const getRecipes = (signal?: AbortSignal) => request<Recipe[]>("/recipes", { signal });
export const saveRecipe = (recipe: RecipeInput, owner: string) =>
  request<Recipe>("/recipes", {
    method: "POST",
    headers: { "X-Session-Owner": owner },
    body: JSON.stringify(recipe),
  });
