import { test, expect } from "@playwright/test";

test.use({ reducedMotion: "no-preference" });

test("navigation, search and custom selects remain styled after client navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "컬렉션", exact: true }).click();
  await expect(page.locator(".mega")).toBeVisible();
  await page.getByRole("link", { name: "모든 컬렉션", exact: true }).click();
  await expect(page).toHaveURL(/\/shop$/);
  await expect(page.locator(".product-card").first()).toHaveCSS("opacity", "1");
  await page.getByRole("combobox", { name: "정렬", exact: true }).click();
  await expect(page.getByRole("listbox", { name: "정렬", exact: true })).toBeVisible();
  await page.getByRole("option", { name: "가격 낮은 순", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "정렬", exact: true })).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "상품 검색", exact: true }).click();
  await page.getByRole("textbox", { name: "어떤 향을 찾고 있나요?" }).fill("candle");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect(page).toHaveURL(/q=candle/);
  await expect(page.getByRole("heading", { name: /캔들/ }).first()).toBeVisible();
});

test("screen animations still refer to defined keyframes after CSS Module scoping", async ({ page }) => {
  for (const route of ["/", "/atelier"]) {
    await page.goto(route);
    if (route === "/atelier") {
      await page.getByRole("button", { name: "향료 직접 고르기" }).click();
      await page.getByRole("button", { name: "베르가못 한 방울 추가", exact: true }).click();
      await page.locator(".a-blend-button:visible,.a-mobile-dock .button:visible").click();
      await expect(page.getByRole("dialog")).toBeVisible();
    }
    const result = await page.evaluate(() => {
      const defined = new Set<string>();
      function visit(rules: CSSRuleList) {
        for (const rule of rules) {
          if (rule instanceof CSSKeyframesRule) defined.add(rule.name);
          else if (rule instanceof CSSImportRule && rule.styleSheet) visit(rule.styleSheet.cssRules);
          else if ("cssRules" in rule) visit((rule as CSSGroupingRule).cssRules);
        }
      }
      for (const sheet of document.styleSheets) {
        try { visit(sheet.cssRules); } catch { /* External font stylesheets cannot be inspected. */ }
      }
      const used = new Set([...document.body.querySelectorAll("*")]
        .flatMap(element => getComputedStyle(element).animationName.split(",").map(name => name.trim()))
        .filter(name => name !== "none"));
      return { count: used.size, missing: [...used].filter(name => !defined.has(name)) };
    });
    expect(result.count).toBeGreaterThan(0);
    expect(result.missing).toEqual([]);
  }
});
