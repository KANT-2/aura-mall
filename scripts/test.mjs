import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const output = mkdtempSync(path.join(tmpdir(), "aura-tests-"));

// Compile only the test dependency graph, then use Node's built-in test runner.
try {
  execFileSync(process.execPath, [require.resolve("typescript/bin/tsc"), "--project", "tsconfig.test.json", "--outDir", output], { cwd: root, stdio: "inherit" });
  const tests = readdirSync(path.join(output, "tests"))
    .filter(name => name.endsWith(".test.js"))
    .map(name => path.join(output, "tests", name));
  for (const test of tests) {
    execFileSync(process.execPath, [test], { cwd: root, stdio: "inherit" });
  }
} catch (error) {
  process.exitCode = typeof error.status === "number" ? error.status : 1;
} finally {
  rmSync(output, { recursive: true, force: true });
}
