import path from "node:path";
import { createMockApp } from "./app";
import { createDatabase } from "./data/store";

const port = Number(process.env.MOCK_PORT ?? 4000);
const filename =
  process.env.MOCK_PERSIST === "0"
    ? undefined
    : path.resolve(process.env.MOCK_DB_FILE ?? "mock-server/.data/db.json");
const app = createMockApp({
  database: createDatabase(filename),
  testMode: process.env.MOCK_TEST_MODE === "1",
});
const server = app.listen(port, "127.0.0.1", () =>
  console.log(`Mock API listening on http://127.0.0.1:${port}`),
);
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
