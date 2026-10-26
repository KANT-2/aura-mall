import { expect, type Page } from "@playwright/test";
import { testIds } from "@/lib/test-ids";
import { routes } from "../fixtures/data";

export class StorefrontPage {
  constructor(readonly page: Page) {}
  get query() {
    return this.page.getByTestId(testIds.catalog.search);
  }
  get products() {
    return this.page.getByTestId(testIds.catalog.card);
  }
  get sort() {
    return this.page.getByTestId(testIds.catalog.sort);
  }
  get addToCart() {
    return this.page.getByTestId(testIds.catalog.addToCart);
  }

  async openCatalogFromMenu() {
    await this.page.goto(routes.home);
    await this.page.getByTestId(testIds.navigation.collections).click();
    await expect(this.page.getByTestId(testIds.navigation.collectionMenu)).toBeVisible();
    await this.page.getByTestId(testIds.navigation.allProducts).click();
  }
  async sortBy(value: "default" | "low" | "high") {
    await this.sort.click();
    await expect(this.page.getByRole("listbox")).toBeVisible();
    await this.page.getByTestId(testIds.option(testIds.catalog.sort, value)).click();
  }
  async search(query: string) {
    await this.page.getByTestId(testIds.navigation.search).click();
    await this.page.getByTestId(testIds.navigation.searchInput).fill(query);
    await this.page.getByTestId(testIds.navigation.searchSubmit).click();
  }
  async prepareLayout(screen: string) {
    if (screen === "gift") {
      for (let index = 0; index < 3; index++) {
        await this.page.getByTestId(testIds.catalog.giftOption).nth(index).check();
      }
    }

    if (screen === "register") {
      await this.page.getByTestId(testIds.account.submit).click();
    }

    if (screen === "mypage") {
      await expect(this.page.getByTestId(testIds.account.overview)).toBeVisible();
    }

    if (screen === "cart") {
      await expect(this.page.getByTestId(testIds.cart.item)).toHaveCount(2);
    }

    if (screen === "checkout") {
      await expect(this.page.getByTestId(testIds.checkout.summary)).toBeVisible();
    }

    await this.page.evaluate(async () => {
      for (const image of document.images) {
        image.loading = "eager";
      }

      await Promise.all([...document.images].map((image) => image.decode().catch(() => {})));
      await document.fonts.ready;
      window.scrollTo({ top: 0, behavior: "instant" });
    });
  }
}
