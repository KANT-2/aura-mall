import { test, expect } from "./fixtures/test";

const heroSource = "/assets/products/warm-eau-de-parfum.webp";
const heroAlt = "우드와 자연 소재 사이에 놓인 AURA 향수";

test("pending images show blur and a spinner without changing their layout", async ({ page }) => {
  let release!: () => void;
  const response = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**${heroSource}`, async (route) => {
    await response;
    await route.continue();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const image = page.getByRole("img", { name: heroAlt });
  const overlay = page.locator(`[data-image-loading="${heroSource}"]`).filter({ visible: true });
  try {
    await expect(overlay.first()).toBeVisible();
    await expect(image).toHaveCSS("filter", /blur\(8px\)/);
    await expect(overlay.first().locator("span")).toHaveCSS("animation-name", "none");
    await test.info().attach("image-loading", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
    const before = await image.boundingBox();
    expect(before?.width).toBeGreaterThan(100);
    await expect(page.getByRole("link", { name: "컬렉션 둘러보기", exact: true })).toBeEnabled();
    release();
    await expect(overlay).toHaveCount(0);
    await expect(image).not.toHaveCSS("filter", /blur/);
    expect(await image.boundingBox()).toEqual(before);
    await expect
      .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
  } finally {
    release();
  }
});

test("failed images stop spinning and retain their alternative text", async ({ page }) => {
  let fail!: () => void;
  const response = new Promise<void>((resolve) => {
    fail = resolve;
  });
  await page.route(`**${heroSource}`, async (route) => {
    await response;
    await route.fulfill({ status: 404, body: "" });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const image = page.getByRole("img", { name: heroAlt });
  const overlay = page.locator(`[data-image-loading="${heroSource}"]`).filter({ visible: true });
  try {
    await expect(overlay.first()).toBeVisible();
    fail();
    await expect(overlay).toHaveCount(0);
    await expect(image).not.toHaveCSS("filter", /blur/);
    await expect(image).toHaveAttribute("alt", heroAlt);
    await expect(image).toHaveJSProperty("complete", true);
    await expect(image).toHaveJSProperty("naturalWidth", 0);
  } finally {
    fail();
  }
});

test("images added after navigation show feedback and clean it up after loading", async ({
  page,
  isMobile,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/shop");
  let release!: () => void;
  const response = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/_next/image?*", async (route) => {
    await response;
    await route.continue();
  });
  await page.getByRole("link", { name: "향 만들기", exact: true }).click();
  const image = page.locator("[data-atelier-entry] img").first();
  const overlay = page.locator('[data-image-loading^="/_next/image?"]');
  try {
    await expect(overlay).toHaveCount(1);
    if (isMobile) {
      await expect(overlay).toBeHidden();
    } else {
      await expect(overlay).toBeVisible();
    }

    await expect(image).toHaveCSS("filter", /blur\(8px\)/);
    await expect(overlay.locator("span")).not.toHaveCSS("animation-name", "none");
    if (!isMobile) {
      await expect(overlay).toHaveCSS("opacity", "1");
    }

    const transition = !isMobile
      ? page.waitForFunction(() => {
          const image = document.querySelector("[data-atelier-entry] img");
          const reveal = image?.getAnimations().find((animation) => {
            const frames = (animation.effect as KeyframeEffect).getKeyframes();
            return frames[0]?.filter !== frames.at(-1)?.filter;
          });
          if (!reveal || reveal.playState !== "running") {
            return false;
          }

          reveal.pause();
          reveal.currentTime = Number(reveal.effect!.getTiming().duration) / 2;
          for (const overlay of document.querySelectorAll(
            '[data-image-loading^="/_next/image?"]',
          )) {
            for (const fade of overlay.getAnimations()) {
              const frames = (fade.effect as KeyframeEffect).getKeyframes();
              if (Number(frames.at(-1)?.opacity) === 0) {
                fade.pause();
                fade.currentTime = Number(fade.effect!.getTiming().duration) / 2;
              }
            }
          }

          return true;
        })
      : undefined;
    release();
    if (transition) {
      await transition;
      await expect(image).toHaveCSS("filter", /blur/);
      await expect(image).not.toHaveCSS("filter", /blur\(8px\)/);
      const opacity = Number(
        await overlay.evaluate((element) => getComputedStyle(element).opacity),
      );
      expect(opacity).toBeGreaterThan(0);
      expect(opacity).toBeLessThan(1);
      await image.evaluate((element) =>
        element.getAnimations().forEach((animation) => animation.play()),
      );
      await overlay.evaluate((element) =>
        element.getAnimations().forEach((animation) => animation.play()),
      );
    }

    await expect(overlay).toHaveCount(0);
    await expect(image).not.toHaveCSS("filter", /blur/);
    await page.getByRole("banner").getByRole("link", { name: "AURA 홈", exact: true }).click();
    await expect(overlay).toHaveCount(0);
  } finally {
    release();
  }
});

test("skeletons animate gently and honor changes to reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  let release!: () => void;
  const response = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/recipes", async (route) => {
    await response;
    await route.continue();
  });
  await page.goto("/mypage");
  const skeleton = page.locator('main [data-variant="account"]');
  try {
    await expect(skeleton).toBeVisible();
    await expect
      .poll(() =>
        skeleton.evaluate(
          (element) =>
            element
              .getAnimations({ subtree: true })
              .filter((animation) => animation.playState === "running").length,
        ),
      )
      .toBeGreaterThan(0);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect
      .poll(() =>
        skeleton.evaluate(
          (element) =>
            element
              .getAnimations({ subtree: true })
              .filter((animation) => animation.playState === "running").length,
        ),
      )
      .toBe(0);
    release();
    await expect(skeleton).toHaveCount(0);
  } finally {
    release();
  }
});
