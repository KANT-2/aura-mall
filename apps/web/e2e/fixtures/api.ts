import type { Page } from "@playwright/test";
import { cart, member, originalRecipe, resumedDraft, savedRecipe } from "./data";
import { CART_STORAGE_KEY } from "@/features/cart/storage/cart-storage";

export async function seedApi(page: Page, data: Record<string, unknown>) {
  const port = process.env.AURA_E2E_MOCK_PORT ?? "4000";
  const guest = await (await page.request.get("/api/auth/me")).json();
  const response = await page.request.post(`http://127.0.0.1:${port}/__test__/seed`, {
    data,
    headers: { "X-Guest-ID": guest.guestId },
  });
  if (!response.ok()) {
    throw new Error(`Mock API fixture failed: ${await response.text()}`);
  }

  const tokens = await response.json();
  if (tokens.accessToken) {
    await page.context().addCookies([
      {
        name: "aura_access",
        value: tokens.accessToken,
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
      {
        name: "aura_refresh",
        value: tokens.refreshToken,
        domain: "127.0.0.1",
        path: "/api/auth",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
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
