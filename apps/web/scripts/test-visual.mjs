import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const result = spawnSync(
  process.execPath,
  [require.resolve("@playwright/test/cli"), "test", ...process.argv.slice(2)],
  {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: { ...process.env, AURA_VISUAL_TESTS: "1" },
    stdio: "inherit",
  },
);
if (result.error) {
  console.error(result.error.message);
}

process.exitCode = result.status ?? 1;
