import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import catalogFixture from "../fixtures/catalog.json";
import type { Catalog } from "../../src/features/catalog/model/catalog";
import type { Member } from "../../src/features/account/model/account";
import type { CartItem } from "../../src/features/cart/model/cart";
import type { AtelierDraft, Recipe } from "../../src/features/atelier/model/recipes";

export const catalog: Catalog = catalogFixture as Catalog;
export type Account = Member & { passwordHash: string; salt: string };
export type MockSession = { guestId: string; userId?: string };
export type Order = {
  id: string;
  owner: string;
  items: CartItem[];
  total: number;
  recipient: string;
  address: string;
  created: string;
};
export type Database = {
  accounts: Record<string, Account>;
  sessions: Record<string, MockSession>;
  carts: Record<string, CartItem[]>;
  recipes: Record<string, Recipe[]>;
  drafts: Record<string, AtelierDraft>;
  orders: Order[];
  inquiries: Record<string, unknown>[];
};
const empty = (): Database => ({
  accounts: {},
  sessions: {},
  carts: {},
  recipes: {},
  drafts: {},
  orders: [],
  inquiries: [],
});
export function createDatabase(filename?: string) {
  let state = empty();
  if (filename && existsSync(filename))
    state = JSON.parse(readFileSync(filename, "utf8")) as Database;
  return {
    state,
    persist() {
      if (!filename) return;
      mkdirSync(path.dirname(filename), { recursive: true });
      writeFileSync(filename + ".tmp", JSON.stringify(state, null, 2));
      renameSync(filename + ".tmp", filename);
    },
  };
}
export type MockDatabase = ReturnType<typeof createDatabase>;
