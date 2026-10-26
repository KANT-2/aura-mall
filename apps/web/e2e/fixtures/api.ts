import type { Page } from "@playwright/test";
import { cart, member, originalRecipe, resumedDraft, savedRecipe } from "./data";
import { CART_STORAGE_KEY } from "@/features/cart/storage/cart-storage";

export async function seedApi(page: Page, data: Record<string, unknown>) {
  const port = process.env.AURA_E2E_MOCK_PORT ?? "4000";
  const response = await page.request.post(`http://127.0.0.1:${port}/__test__/seed`, { data });
  if (!response.ok()) {
    throw new Error(`Mock API fixture failed: ${await response.text()}`);
  }
}
export const seedDraft = (page: Page) => seedApi(page, { draft: resumedDraft });
export const seedOriginalRecipe = (page: Page) => seedApi(page, { recipes: [originalRecipe] });
export async function seedLayout(page: Page, screen: string) {
  await seedApi(page, {
    ...(screen === "mypage" ? { member, recipes: [savedRecipe] } : {}),
  });
  if (["cart", "checkout"].includes(screen)) {
    await seedLocalCart(page, cart);
  }
}

export async function seedLocalCart(page: Page, items: unknown) {
  await page.goto("/");
  await page.evaluate(
    ({ key, items }) => {
      localStorage.setItem(key, JSON.stringify(items));
      window.dispatchEvent(new StorageEvent("storage", { key }));
    },
    { key: CART_STORAGE_KEY, items },
  );
}

export const getDraft = async (page: Page) => (await page.request.get("/api/atelier/draft")).json();
