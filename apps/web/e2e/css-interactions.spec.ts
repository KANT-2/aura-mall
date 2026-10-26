import { test, expect } from "./fixtures/test";
import { routes } from "./fixtures/data";
import { testIds } from "@/lib/test-ids";

test.use({ reducedMotion: "no-preference" });

test("motion keeps the hydrating client tree free of attribute mismatch errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /hydrat/i.test(message.text())) {
      errors.push(message.text());
    }
  });
  for (const route of [routes.home, routes.shop, routes.product, routes.login]) {
    await page.goto(route);
    await expect(page.getByRole("main")).toBeVisible();
    await page.getByTestId(testIds.navigation.cart).click();
    await expect(page).toHaveURL((url) => url.pathname === routes.cart);
  }

  expect(errors).toEqual([]);
});

test("navigation, search and custom selects remain styled after client navigation", async ({
  page,
  storefront,
}) => {
  await storefront.openCatalogFromMenu();
  await expect(page).toHaveURL((url) => url.pathname === routes.shop);
  await expect(storefront.products.first()).toHaveCSS("opacity", "1");
  await storefront.sortBy("low");
  await expect(storefront.sort).toHaveAttribute("aria-expanded", "false");
  const query = "candle";
  await storefront.search(query);
  await expect(page).toHaveURL((url) => url.searchParams.get("q") === query);
  await expect(storefront.products).toHaveCount(3);
});

test("screen animations still refer to defined keyframes after CSS Module scoping", async ({
  page,
  atelier,
}) => {
  for (const route of [routes.home, routes.atelier]) {
    if (route === routes.atelier) {
      await atelier.openWorkspace();
      await atelier.openBlend();
    } else {
      await page.goto(route);
    }

    const result = await page.evaluate(() => {
      const defined = new Set<string>();
      function visit(rules: CSSRuleList) {
        for (const rule of rules) {
          if (rule instanceof CSSKeyframesRule) {
            defined.add(rule.name);
          } else if (rule instanceof CSSImportRule && rule.styleSheet) {
            visit(rule.styleSheet.cssRules);
          } else if ("cssRules" in rule) {
            visit((rule as CSSGroupingRule).cssRules);
          }
        }
      }
      for (const sheet of document.styleSheets) {
        try {
          visit(sheet.cssRules);
        } catch {
          /* External font stylesheets cannot be inspected. */
        }
      }

      const used = new Set(
        [...document.body.querySelectorAll("*")]
          .flatMap((element) =>
            getComputedStyle(element)
              .animationName.split(",")
              .map((name) => name.trim()),
          )
          .filter((name) => name !== "none"),
      );
      return { count: used.size, missing: [...used].filter((name) => !defined.has(name)) };
    });
    expect(result.count).toBeGreaterThan(0);
    expect(result.missing).toEqual([]);
  }
});

test("query drafts preserve whitespace and accept external search navigation", async ({
  page,
  storefront,
}) => {
  await storefront.openCatalogFromMenu();
  await storefront.query.fill("white ");
  await expect(page).toHaveURL((url) => url.searchParams.get("q") === "white");
  await expect(storefront.query).toHaveValue("white ");
  await storefront.search("candle");
  await expect(storefront.query).toHaveValue("candle");
});
