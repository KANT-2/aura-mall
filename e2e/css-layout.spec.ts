import { test, expect } from "@playwright/test";

const cases = [
  { name: "home", path: "/" },
  { name: "shop", path: "/shop" },
  { name: "product", path: "/shop/fresh-eau-de-parfum" },
  { name: "gift", path: "/shop/fresh-gift-set" },
  { name: "cart", path: "/cart" },
  { name: "checkout", path: "/checkout" },
  { name: "login", path: "/login" },
  { name: "register", path: "/register" },
  { name: "mypage", path: "/mypage" },
  { name: "partner", path: "/partner" },
];

for (const screen of cases) {
  test(`${screen.name} preserves its layout and appearance`, async ({ page }) => {
    const errors: Error[] = [];
    page.on("pageerror", error => errors.push(error));
    await page.addInitScript(name => {
      const member = { email: "layout@example.com", name: "AURA", coupon: true };
      const recipe = { id: "layout", name: "느린 오후", counts: { bergamot: 3, rose: 2 }, version: 1, label: "paper", color: "#d5b575", created: "2026-01-01T00:00:00.000Z" };
      localStorage.setItem("aura_members_v2", JSON.stringify([{ ...member, salt: "a".repeat(32), hash: "a".repeat(64) }]));
      if (name === "mypage") {
        localStorage.setItem("aura_session_v2", JSON.stringify(member));
        localStorage.setItem("aura_recipes_v2_" + member.email, JSON.stringify([recipe]));
      }
      if (name === "cart" || name === "checkout") {
        localStorage.setItem("aura_cart_v3_guest", JSON.stringify([
          { product: { id: "fresh-eau-de-parfum" }, quantity: 2, selection: [] },
          { product: { id: "fresh-gift-set" }, quantity: 1, selection: ["fresh-hand-cream", "fresh-hand-wash", "fresh-candle"] },
        ]));
      }
    }, screen.name);
    await page.goto(screen.path);
    if (screen.name === "gift") {
      for (let index = 0; index < 3; index++) await page.locator(".gift-option input").nth(index).check();
    }
    if (screen.name === "register") await page.getByRole("button", { name: "회원가입", exact: true }).click();
    if (screen.name === "mypage") await expect(page.getByRole("heading", { name: "AURA님의 취향 기록" })).toBeVisible();
    if (screen.name === "cart") await expect(page.locator(".cart-item")).toHaveCount(2);
    if (screen.name === "checkout") await expect(page.getByRole("heading", { name: "선택한 상품" })).toBeVisible();
    await page.evaluate(async () => {
      for (const image of document.images) image.loading = "eager";
      await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
      await document.fonts.ready;
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    await expect(page).toHaveScreenshot(`css-${screen.name}.png`, { fullPage: true, maxDiffPixels: 100 });
    expect(errors).toEqual([]);
  });
}
