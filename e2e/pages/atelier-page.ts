import { expect, type Page } from "@playwright/test";
import { testIds } from "@/lib/test-ids";
import { composition, routes } from "../fixtures/data";

export class AtelierPage {
  constructor(readonly page: Page) {}
  get root() {
    return this.page.getByTestId(testIds.atelier.root);
  }
  get start() {
    return this.page.getByTestId(testIds.atelier.start);
  }
  get resume() {
    return this.page.getByTestId(testIds.atelier.resume);
  }
  get dialog() {
    return this.page.getByRole("dialog");
  }
  get slider() {
    return this.page.getByRole("slider");
  }
  get automatic() {
    return this.page.getByTestId(testIds.atelier.automatic);
  }
  get sensor() {
    return this.page.getByTestId(testIds.atelier.sensor);
  }
  get finish() {
    return this.page.getByTestId(testIds.atelier.finish);
  }
  get name() {
    return this.page.getByTestId(testIds.atelier.name);
  }
  get addToCart() {
    return this.page.getByTestId(testIds.atelier.addToCart);
  }
  get edit() {
    return this.page.getByTestId(testIds.atelier.edit);
  }
  get restart() {
    return this.page.getByTestId(testIds.atelier.restart);
  }
  ingredient(id = composition.ingredientId) {
    return this.page.getByTestId(testIds.atelier.ingredient(id));
  }

  async goto(parameters: Record<string, string> = {}) {
    const query = new URLSearchParams(parameters).toString();
    await this.page.goto(routes.atelier + (query ? `?${query}` : ""));
  }
  async openWorkspace() {
    await this.goto();
    await this.start.click();
    await this.ingredient().click();
  }
  async openBlend() {
    await this.page.getByTestId(testIds.atelier.blend).filter({ visible: true }).click();
    await expect(this.dialog).toBeVisible();
  }
  async finishByKeyboard() {
    for (let index = 0; index < 13; index++) {
      await this.slider.press("ArrowRight");
    }
    await expect(this.slider).toHaveAttribute("aria-valuenow", "100");
    await this.finish.click();
  }
  async expectStep(step: "entry" | "select" | "result") {
    await expect(this.root).toHaveAttribute("data-atelier-step", step);
  }
  async expectDropCount(count: number) {
    await expect(this.page.getByTestId(testIds.atelier.dropCount)).toHaveAttribute(
      "aria-valuenow",
      String(count),
    );
  }
  async clear() {
    if (await this.page.getByTestId(testIds.atelier.dock).isVisible()) {
      await this.page.getByTestId(testIds.atelier.recipe).click();
      await this.dialog
        .getByTestId(testIds.atelier.removeIngredient(composition.ingredientId))
        .click();
      await this.closeDialog();
    } else {
      await this.page.getByTestId(testIds.atelier.clear).click();
    }
  }
  async closeDialog() {
    await this.page.keyboard.press("Escape");
  }
}
