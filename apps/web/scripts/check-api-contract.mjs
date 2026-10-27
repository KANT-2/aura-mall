import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import openapiTS, { astToString } from "openapi-typescript";

const web = fileURLToPath(new URL("../", import.meta.url));
const root = fileURLToPath(new URL("../../../", import.meta.url));
const generated = new URL("../contracts/generated/", import.meta.url);
await mkdir(generated, { recursive: true });
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
run(
  process.env.UV_BIN ?? "uv",
  [
    "run",
    "--directory",
    "apps/api",
    "--locked",
    "python",
    "-m",
    "aura_api.openapi",
    "--output",
    fileURLToPath(new URL("openapi.json", generated)),
  ],
  root,
);
const schema = JSON.parse(await readFile(new URL("openapi.json", generated), "utf8"));
const expected = JSON.parse(
  await readFile(new URL("../contracts/operations.json", import.meta.url), "utf8"),
);
const operations = Object.entries(schema.paths)
  .flatMap(([path, methods]) =>
    Object.keys(methods)
      .filter((method) => ["get", "post", "put", "patch", "delete"].includes(method))
      .map((method) => `${method.toUpperCase()} ${path}`),
  )
  .sort();
if (
  schema.info["x-contract-version"] !== expected.version ||
  JSON.stringify(operations) !== JSON.stringify(expected.operations.toSorted())
) {
  throw new Error(
    "FastAPI operation/version contract changed. Review contracts/operations.json and DTO compatibility.",
  );
}

await writeFile(new URL("fastapi.d.ts", generated), astToString(await openapiTS(schema)));
run(
  process.execPath,
  [
    fileURLToPath(new URL("../../../node_modules/typescript/bin/tsc", import.meta.url)),
    "--project",
    "contracts/tsconfig.json",
  ],
  web,
);
console.log(
  `FastAPI contract ${expected.version}: ${operations.length} operations and public DTO types verified.`,
);
