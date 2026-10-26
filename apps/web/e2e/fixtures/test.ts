import { test as base, expect } from "@playwright/test";
import { AccountPage } from "../pages/account-page";
import { AtelierPage } from "../pages/atelier-page";
import { StorefrontPage } from "../pages/storefront-page";

export const test = base.extend<{
  account: AccountPage;
  atelier: AtelierPage;
  storefront: StorefrontPage;
  appErrors: Error[];
}>({
  account: async ({ page }, provide) => {
    await provide(new AccountPage(page));
  },
  atelier: async ({ page }, provide) => {
    await provide(new AtelierPage(page));
  },
  storefront: async ({ page }, provide) => {
    await provide(new StorefrontPage(page));
  },
  appErrors: [
    async ({ page }, provide) => {
      const errors: Error[] = [];
      const recordError = (error: Error) => errors.push(error);
      page.on("pageerror", recordError);
      await provide(errors);
      page.off("pageerror", recordError);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };
