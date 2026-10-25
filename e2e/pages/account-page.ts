import { expect, type Page } from "@playwright/test";
import { testIds } from "@/lib/test-ids";
import { routes } from "../fixtures/data";

export class AccountPage {
  constructor(readonly page: Page) {}
  get cartItems() {
    return this.page.getByTestId(testIds.cart.item);
  }
  get firstProductLink() {
    return this.cartItems.first().getByRole("link").first();
  }
  async signIn(credentials: { email: string; password: string }, next: string = routes.mypage) {
    await this.page.goto(`${routes.login}?next=${encodeURIComponent(next)}`);
    await this.page.getByTestId(testIds.account.email).fill(credentials.email);
    await this.page.getByTestId(testIds.account.password).fill(credentials.password);
    await this.page.getByTestId(testIds.account.submit).click();
    await expect(this.page).toHaveURL((url) => url.pathname === next);
  }
  async signOut() {
    await this.page.getByTestId(testIds.navigation.account).click();
    await this.page.getByTestId(testIds.account.logout).click();
    await expect(this.page.getByTestId(testIds.navigation.account)).toHaveAttribute(
      "href",
      routes.login,
    );
  }
  async openCart() {
    await this.page.getByTestId(testIds.navigation.cart).click();
  }
}
