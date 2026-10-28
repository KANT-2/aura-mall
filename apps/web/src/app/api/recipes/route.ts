import { createBffHandler } from "@/server/bff/handler";
import { recipeResponse, recipesResponse } from "@/server/backend/storefront";

export const GET = createBffHandler("GET", "/recipes", { responseBody: recipesResponse });
export const POST = createBffHandler("POST", "/recipes", {
  bodyFields: ["name", "label", "counts", "parent"],
  responseBody: recipeResponse,
});
