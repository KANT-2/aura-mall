import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import catalogFixture from "../fixtures/catalog.json";
import type { Catalog, Product } from "@/features/catalog/model/catalog";
import type { Member } from "@/features/account/model/account";
import type { AdminHistoryEntry, InquiryStatus } from "@/features/admin/model/admin";
import type { CartItem } from "@/features/cart/model/cart";
import type { AtelierDraft, Recipe } from "@/features/atelier/model/recipes";

export const catalog: Catalog = catalogFixture as Catalog;
export type Account = Member & { passwordHash: string; salt: string };
export type Order = {
  id: string;
  owner: string;
  items: CartItem[];
  total: number;
  recipient: string;
  address: string;
  created: string;
  idempotencyKey?: string;
};
export type Inquiry = {
  id: string;
  brand: string;
  name: string;
  email: string;
  introduction: string;
  message: string;
  type: string;
  website: string;
  created: string;
  status?: InquiryStatus;
  memo?: string;
  version?: number;
  updated?: string;
};
export type AuditRecord = AdminHistoryEntry & { actorId: string; target: string };
export type Database = {
  accounts: Record<string, Account>;
  tokenFamilies: Record<string, { userId: string; revoked: boolean; principal?: "admin" }>;
  refreshTokens: Record<string, { familyId: string; consumed: boolean; expires: number }>;
  recipes: Record<string, Recipe[]>;
  drafts: Record<string, AtelierDraft>;
  orders: Order[];
  inquiries: Inquiry[];
  /** Mutable catalog products. Orders keep their own product snapshots. */
  products: Product[];
  productVersions: Record<string, { version: number; updated: string }>;
  adminAudit: AuditRecord[];
  stockRequests: Record<string, { productId: string; delta: number; reason: string }>;
};
const empty = (): Database => ({
  accounts: {},
  tokenFamilies: {},
  refreshTokens: {},
  recipes: {},
  drafts: {},
  orders: [],
  inquiries: [],
  products: structuredClone(catalog.products),
  productVersions: {},
  adminAudit: [],
  stockRequests: {},
});
export function createDatabase(filename?: string) {
  let state = empty();
  if (filename && existsSync(filename)) {
    state = { ...state, ...(JSON.parse(readFileSync(filename, "utf8")) as Partial<Database>) };
    // Carts moved to browser storage; do not persist legacy server carts again.
    Reflect.deleteProperty(state, "carts");
    Reflect.deleteProperty(state, "sessions");
  }

  return {
    state,
    persist() {
      if (!filename) {
        return;
      }

      mkdirSync(path.dirname(filename), { recursive: true });
      writeFileSync(filename + ".tmp", JSON.stringify(state, null, 2));
      renameSync(filename + ".tmp", filename);
    },
  };
}
export type MockDatabase = ReturnType<typeof createDatabase>;
export const catalogOf = (database: MockDatabase): Catalog => ({
  ...catalog,
  products: database.state.products,
});
