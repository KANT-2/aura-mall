import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import type { MockDatabase } from "./data/store";

/** Local Mock only. Production admins are issued by the backend's operator procedure. */
export function ensureMockAdmin(database: MockDatabase, email: string, password: string) {
  const accounts = database.state.accounts;
  const existing = Object.values(accounts).find((account) => account.email === email);
  const salt = randomBytes(16).toString("hex");
  const account = existing ?? {
    id: randomUUID(),
    name: "AURA 운영자",
    email,
    coupon: false,
    marketing: false,
  };
  accounts[account.id] = {
    ...account,
    role: "admin",
    salt,
    passwordHash: scryptSync(password, salt, 32).toString("hex"),
  };
  database.persist();
}
