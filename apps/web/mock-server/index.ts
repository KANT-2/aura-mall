import path from "node:path";
import { createMockApp } from "./app";
import { createDatabase } from "./data/store";
import { ensureMockAdmin } from "./admin-account";

const port = Number(process.env.MOCK_PORT ?? 4000);
const filename =
  process.env.MOCK_PERSIST === "0"
    ? undefined
    : path.resolve(process.env.MOCK_DB_FILE ?? "mock-server/.data/db.json");
const database = createDatabase(filename);
const adminEmail = process.env.MOCK_ADMIN_EMAIL ?? "admin@aura.local";
if (adminEmail) {
  ensureMockAdmin(database, adminEmail, process.env.MOCK_ADMIN_PASSWORD ?? "aura-admin-local");
}

const app = createMockApp({ database, testMode: process.env.MOCK_TEST_MODE === "1" });
const server = app.listen(port, "127.0.0.1", () =>
  console.log(`Mock API listening on http://127.0.0.1:${port}`),
);
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
