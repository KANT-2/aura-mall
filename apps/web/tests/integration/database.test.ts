import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { createDatabase } from "../../mock-server/data/store";

it("reloads persisted mock data independently of the browser and server instance", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "aura-mock-db-"));
  try {
    const filename = path.join(directory, "db.json");
    const first = createDatabase(filename);
    first.state.drafts.guest = {
      name: "초안",
      label: "paper",
      counts: { rose: 2 },
      step: "select",
    };
    first.persist();
    expect(createDatabase(filename).state.drafts.guest).toEqual(first.state.drafts.guest);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
it("reports a damaged database without silently overwriting persisted data", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "aura-mock-db-"));
  try {
    const filename = path.join(directory, "db.json");
    writeFileSync(filename, "damaged json");
    expect(() => createDatabase(filename)).toThrow();
    expect(readFileSync(filename, "utf8")).toBe("damaged json");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("drops legacy server carts when reloading a database", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "aura-mock-db-"));
  try {
    const filename = path.join(directory, "db.json");
    writeFileSync(filename, JSON.stringify({ ...createDatabase().state, carts: { guest: [] } }));
    const database = createDatabase(filename);
    expect(database.state).not.toHaveProperty("carts");
    database.persist();
    expect(JSON.parse(readFileSync(filename, "utf8"))).not.toHaveProperty("carts");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
