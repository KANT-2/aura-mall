import type { Page } from "@playwright/test";
import { cart, member, originalRecipe, resumedDraft, savedRecipe } from "./data";

export async function seedApi(page: Page, data: Record<string, unknown>) {
  const response = await page.request.post("http://127.0.0.1:4000/__test__/seed", { data });
  if (!response.ok()) throw new Error(`Mock API fixture failed: ${await response.text()}`);
}
export const seedDraft = (page: Page) => seedApi(page, { draft: resumedDraft });
export const seedOriginalRecipe = (page: Page) => seedApi(page, { recipes: [originalRecipe] });
export async function seedLayout(page: Page, screen: string) {
  await seedApi(page, {
    ...(screen === "mypage" ? { member, recipes: [savedRecipe] } : {}),
    ...(["cart", "checkout"].includes(screen) ? { cart } : {}),
  });
}

export const getDraft = async (page: Page) => (await page.request.get("/api/atelier/draft")).json();
