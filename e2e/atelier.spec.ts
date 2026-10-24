import { test as base, expect, type Page } from "@playwright/test";

const test = base.extend<{ appErrors: Error[] }>({
  appErrors: [async ({ page }, use) => {
    const errors: Error[] = [];
    page.on("pageerror", error => errors.push(error));
    await use(errors);
    expect(errors).toEqual([]);
  }, { auto: true }],
});

async function openWorkspace(page: Page, url = "/atelier") {
  await page.goto(url);
  await page.getByRole("button", { name: "향료 직접 고르기" }).click();
  await page.getByRole("button", { name: "베르가못 한 방울 추가", exact: true }).click();
}

async function openBlend(page: Page) {
  await page.locator(".a-blend-button:visible,.a-mobile-dock .button:visible").click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

async function finishByKeyboard(page: Page) {
  const slider = page.getByRole("slider");
  for (let index = 0; index < 13; index++) await slider.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuenow", "100");
  await page.getByRole("button", { name: "이 향에 이름 붙이기" }).click();
}

async function expectDropCount(page: Page, count: number) {
  if (await page.locator(".a-mobile-dock").isVisible()) {
    await expect(page.locator(".a-dock-summary")).toContainText(`${count}/20회`);
  } else {
    await expect(page.getByRole("progressbar", { name: "향료 투입 횟수" })).toHaveAttribute("aria-valuenow", String(count));
  }
}

test("rapid selection enforces the drop limit and clearing resets the composition", async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole("button", { name: "베르가못 한 방울 추가", exact: true }).evaluate(button => {
    for (let index = 0; index < 40; index++) (button as HTMLButtonElement).click();
  });
  await expectDropCount(page, 20);
  await expect(page.getByRole("button", { name: "베르가못 한 방울 추가", exact: true })).toBeDisabled();
  if (await page.locator(".a-mobile-dock").isVisible()) {
    await page.locator(".a-dock-summary").click();
    await page.getByRole("button", { name: "베르가못 삭제", exact: true }).click();
    await page.keyboard.press("Escape");
  } else {
    await page.getByRole("button", { name: "전체 비우기", exact: true }).click();
  }
  await expectDropCount(page, 0);
  await expect(page.getByRole("button", { name: "베르가못 한 방울 추가", exact: true })).toBeEnabled();
});

test("keyboard blending reaches a named result and edits invalidate cart confirmation", async ({ page }) => {
  await openWorkspace(page);
  await openBlend(page);
  await finishByKeyboard(page);
  const name = page.getByRole("textbox", { name: "향 이름" });
  await name.fill("나의 첫 향");
  await page.getByRole("button", { name: "이 향을 장바구니에 담기" }).click();
  await expect(page.getByRole("button", { name: "장바구니에 추가됨" })).toBeDisabled();
  await name.fill("새 이름");
  await expect(page.getByRole("button", { name: "이 향을 장바구니에 담기" })).toBeEnabled();
  await page.getByRole("button", { name: "조합 수정" }).click();
  await expect(page.getByRole("heading", { name: "향을 만드는 시간" })).toBeVisible();
  await expectDropCount(page, 1);
});

test("closing automatic blending cancels timers and reopening starts at zero", async ({ page }) => {
  await openWorkspace(page);
  await page.clock.install();
  await openBlend(page);
  await page.getByRole("button", { name: "자동으로 섞기" }).click();
  await page.clock.runFor(1000);
  await expect(page.getByRole("slider")).not.toHaveAttribute("aria-valuenow", "0");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await openBlend(page);
  await page.clock.runFor(1000);
  await expect(page.getByRole("slider")).toHaveAttribute("aria-valuenow", "0");
  await page.getByRole("button", { name: "자동으로 섞기" }).click();
  await page.clock.runFor(9000);
  await expect(page.getByRole("slider")).toHaveAttribute("aria-valuenow", "100");
  await expect(page.getByRole("button", { name: "이 향에 이름 붙이기" })).toBeVisible();
});

test("ordinary visits show draft recovery and explicit resume restores a result", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("aura_atelier_draft_v2", JSON.stringify({
    counts: { rose: 2 }, name: "이어 만들 향", label: "paper", step: "result",
  })));
  await page.goto("/atelier");
  await expect(page.getByRole("heading", { name: "취향을 한 방울씩" })).toBeVisible();
  await expect(page.getByRole("button", { name: "이어서 만들기" })).toBeVisible();
  await page.goto("/atelier?resume=1");
  await expect(page.getByRole("textbox", { name: "향 이름" })).toHaveValue("이어 만들 향");
  await page.getByRole("button", { name: "새 향 만들기" }).click();
  await expect(page.getByRole("heading", { name: "취향을 한 방울씩" })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("aura_atelier_draft_v2"))).toBeNull();
});

test("starting a new composition does not reopen the recipe left in the URL", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("aura_recipes_v2_guest", JSON.stringify([{
    id: "original", name: "원본 조합", counts: { bergamot: 2 }, version: 2,
  }])));
  await page.goto("/atelier?recipe=original");
  await expect(page.getByRole("heading", { name: "향을 만드는 시간" })).toBeVisible();
  await openBlend(page);
  await finishByKeyboard(page);
  await expect(page.getByRole("textbox", { name: "향 이름" })).toHaveValue("원본 조합");
  await page.getByRole("button", { name: "새 향 만들기" }).click();
  await expect(page.getByRole("heading", { name: "취향을 한 방울씩" })).toBeVisible();
  await page.getByRole("button", { name: "향료 직접 고르기" }).click();
  await expectDropCount(page, 0);
});

type MotionWindow = Window & { resolveMotion?: (value: string) => void };
async function mockMotion(page: Page, permission: "granted" | "denied" | "pending") {
  await page.addInitScript(mode => {
    Object.defineProperty(window, "DeviceMotionEvent", {
      configurable: true,
      value: class extends Event {
        static requestPermission() {
          return mode === "pending"
            ? new Promise<string>(resolve => { (window as MotionWindow).resolveMotion = resolve; })
            : Promise.resolve(mode);
        }
      },
    });
  }, permission);
}

async function emitShake(page: Page) {
  await page.evaluate(() => {
    const event = new Event("devicemotion");
    Object.defineProperties(event, {
      acceleration: { value: { x: 10, y: 0, z: 0 } },
      accelerationIncludingGravity: { value: null },
    });
    window.dispatchEvent(event);
  });
}

test("denied motion permission keeps keyboard and automatic mixing available", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Sensor controls are only offered on handheld screens.");
  await mockMotion(page, "denied");
  await openWorkspace(page);
  await openBlend(page);
  await page.getByRole("button", { name: "휴대폰 흔들기 켜기" }).click();
  await expect(page.getByRole("button", { name: "흔들기 권한 다시 요청" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "자동으로 섞기" })).toBeEnabled();
  await page.getByRole("slider").press("ArrowRight");
  await expect(page.getByRole("slider")).toHaveAttribute("aria-valuenow", "8");
});

test("late permission resolution cannot restart sensors after the modal closes", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Sensor controls are only offered on handheld screens.");
  await mockMotion(page, "pending");
  await openWorkspace(page);
  await openBlend(page);
  await page.getByRole("button", { name: "휴대폰 흔들기 켜기" }).click();
  await expect(page.getByRole("button", { name: "센서 권한 확인 중…" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.evaluate(() => (window as MotionWindow).resolveMotion?.("granted"));
  await openBlend(page);
  await expect(page.getByRole("button", { name: "휴대폰 흔들기 켜기" })).toBeEnabled();
  await expect(page.locator(".shake-mode")).toHaveCount(0);
  await emitShake(page);
  await expect(page.getByRole("slider")).toHaveAttribute("aria-valuenow", "0");
});

test("motion requires repeated peaks and missing sensor data falls back", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Sensor controls are only offered on handheld screens.");
  await mockMotion(page, "granted");
  await openWorkspace(page);
  await page.clock.install();
  await openBlend(page);
  await page.getByRole("button", { name: "휴대폰 흔들기 켜기" }).click();
  await expect(page.locator(".shake-mode")).toBeVisible();
  await page.clock.runFor(1000);
  await emitShake(page);
  await expect(page.getByRole("slider")).toHaveAttribute("aria-valuenow", "0");
  await page.clock.runFor(500);
  await emitShake(page);
  await expect(page.getByRole("slider")).not.toHaveAttribute("aria-valuenow", "0");
  await page.keyboard.press("Escape");
  await openBlend(page);
  await page.getByRole("button", { name: "휴대폰 흔들기 켜기" }).click();
  await page.clock.runFor(4600);
  await expect(page.getByRole("button", { name: "센서 확인 후 다시 시도" })).toBeEnabled();
  await expect(page.getByRole("slider")).toHaveAttribute("aria-valuenow", "0");
});
