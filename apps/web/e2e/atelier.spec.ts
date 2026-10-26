import { test, expect } from "./fixtures/test";
import { composition, originalRecipe, resumedDraft } from "./fixtures/data";
import { getDraft, seedDraft, seedOriginalRecipe } from "./fixtures/api";
import { emitShake, mockMotion, type MotionWindow } from "./support/motion";

test("rapid selection enforces the drop limit and clearing resets the composition", async ({
  atelier,
}) => {
  await atelier.openWorkspace();
  await atelier.ingredient().evaluate((button) => {
    for (let index = 0; index < 40; index++) {
      (button as HTMLButtonElement).click();
    }
  });
  await atelier.expectDropCount(20);
  await expect(atelier.ingredient()).toBeDisabled();
  await atelier.clear();
  await atelier.expectDropCount(0);
  await expect(atelier.ingredient()).toBeEnabled();
});

test("keyboard blending reaches a named result and edits invalidate cart confirmation", async ({
  atelier,
  page,
}) => {
  await atelier.openWorkspace();
  await atelier.openBlend();
  await atelier.finishByKeyboard();
  await atelier.name.fill(composition.name);
  await atelier.addToCart.click();
  await expect(atelier.addToCart).toBeDisabled();
  await atelier.name.fill(composition.revisedName);
  await expect(atelier.addToCart).toBeEnabled();
  await atelier.edit.click();
  await atelier.expectStep("select");
  await atelier.expectDropCount(1);
  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: composition.name, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: composition.name, exact: true })).toBeVisible();
});

test("server autosave survives reload and clearing the last ingredient discards the draft", async ({
  page,
  atelier,
}) => {
  await atelier.openWorkspace();
  await expect
    .poll(async () => (await getDraft(page))?.counts)
    .toEqual({ [composition.ingredientId]: 1 });
  await page.reload();
  await atelier.expectStep("entry");
  await atelier.resume.click();
  await atelier.expectDropCount(1);
  await atelier.clear();
  await expect.poll(() => getDraft(page)).toBeNull();
  await page.reload();
  await atelier.expectStep("entry");
  await expect(atelier.resume).toHaveCount(0);
});

test("closing automatic blending cancels timers and reopening starts at zero", async ({
  page,
  atelier,
}) => {
  await atelier.openWorkspace();
  await page.clock.install();
  await atelier.openBlend();
  await atelier.automatic.click();
  await page.clock.runFor(1000);
  await expect(atelier.slider).not.toHaveAttribute("aria-valuenow", "0");
  await atelier.closeDialog();
  await expect(atelier.dialog).toHaveCount(0);
  await atelier.openBlend();
  await page.clock.runFor(1000);
  await expect(atelier.slider).toHaveAttribute("aria-valuenow", "0");
  await atelier.automatic.click();
  await page.clock.runFor(9000);
  await expect(atelier.slider).toHaveAttribute("aria-valuenow", "100");
  await expect(atelier.finish).toBeVisible();
});

test("ordinary visits show draft recovery and explicit resume restores a result", async ({
  page,
  atelier,
}) => {
  await seedDraft(page);
  await atelier.goto();
  await atelier.expectStep("entry");
  await expect(atelier.resume).toBeVisible();
  await atelier.goto({ resume: "1" });
  await expect(atelier.name).toHaveValue(resumedDraft.name);
  await atelier.restart.click();
  await atelier.expectStep("entry");
  await expect.poll(() => getDraft(page)).toBeNull();
});

test("starting a new composition does not reopen the recipe left in the URL", async ({
  page,
  atelier,
}) => {
  await seedOriginalRecipe(page);
  await atelier.goto({ recipe: originalRecipe.id });
  await atelier.expectStep("select");
  await atelier.openBlend();
  await atelier.finishByKeyboard();
  await expect(atelier.name).toHaveValue(originalRecipe.name);
  await atelier.restart.click();
  await atelier.expectStep("entry");
  await atelier.start.click();
  await atelier.expectDropCount(0);
});

test("denied motion permission keeps keyboard and automatic mixing available", async ({
  page,
  atelier,
  isMobile,
}) => {
  test.skip(!isMobile, "Sensor controls are only offered on handheld screens.");
  await mockMotion(page, "denied");
  await atelier.openWorkspace();
  await atelier.openBlend();
  await atelier.sensor.click();
  await expect(atelier.sensor).toHaveAttribute("data-state", "denied");
  await expect(atelier.sensor).toBeEnabled();
  await expect(atelier.automatic).toBeEnabled();
  await atelier.slider.press("ArrowRight");
  await expect(atelier.slider).toHaveAttribute("aria-valuenow", "8");
});

test("late permission resolution cannot restart sensors after the modal closes", async ({
  page,
  atelier,
  isMobile,
}) => {
  test.skip(!isMobile, "Sensor controls are only offered on handheld screens.");
  await mockMotion(page, "pending");
  await atelier.openWorkspace();
  await atelier.openBlend();
  await atelier.sensor.click();
  await expect(atelier.sensor).toBeDisabled();
  await atelier.closeDialog();
  await page.evaluate(() => (window as MotionWindow).resolveMotion?.("granted"));
  await atelier.openBlend();
  await expect(atelier.sensor).toBeEnabled();
  await expect(atelier.slider).not.toHaveAttribute("data-mixing-mode", "shake");
  await emitShake(page);
  await expect(atelier.slider).toHaveAttribute("aria-valuenow", "0");
});

test("motion requires repeated peaks and missing sensor data falls back", async ({
  page,
  atelier,
  isMobile,
}) => {
  test.skip(!isMobile, "Sensor controls are only offered on handheld screens.");
  await mockMotion(page, "granted");
  await atelier.openWorkspace();
  await page.clock.install();
  await atelier.openBlend();
  await atelier.sensor.click();
  await expect(atelier.slider).toHaveAttribute("data-mixing-mode", "shake");
  await page.clock.runFor(1000);
  await emitShake(page);
  await expect(atelier.slider).toHaveAttribute("aria-valuenow", "0");
  await page.clock.runFor(500);
  await emitShake(page);
  await expect(atelier.slider).not.toHaveAttribute("aria-valuenow", "0");
  await atelier.closeDialog();
  await atelier.openBlend();
  await atelier.sensor.click();
  await page.clock.runFor(4600);
  await expect(atelier.sensor).toHaveAttribute("data-state", "unavailable");
  await expect(atelier.sensor).toBeEnabled();
  await expect(atelier.slider).toHaveAttribute("aria-valuenow", "0");
});
