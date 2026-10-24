import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
function files(directory) {
  return readdirSync(path.join(root, directory), { withFileTypes: true })
    .flatMap(entry => entry.isDirectory() ? files(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]);
}

const source = file => readFileSync(path.join(root, file), "utf8");
assert.deepEqual(files("app").filter(file => file.endsWith(".css")), ["app/globals.css"],
  "App-wide CSS belongs in globals.css; add screen styles as CSS Modules.");

const shared = ["tokens", "base", "components", "shell", "motion"];
assert.deepEqual(files("styles").sort(), shared.map(name => `styles/${name}.css`).sort(),
  "Keep shared stylesheet responsibilities explicit.");
const imports = [...source("app/globals.css").matchAll(/@import\s+"([^"]+)";/g)].map(match => match[1]);
assert.deepEqual(imports, ["tailwindcss", ...shared.map(name => `../styles/${name}.css`)],
  "Preserve the shared CSS import order.");

const modules = [];
const legacyScreenModules = new Set([
  "components/editorial/Home.module.css",
  "components/commerce/Commerce.module.css",
  "components/editorial/Account.module.css",
  "components/editorial/Partner.module.css",
  "components/atelier/Atelier.module.css",
]);
for (const file of [...files("app"), ...files("components")]) {
  if (/\.[cm]?[jt]sx?$/.test(file)) {
    const css = [...source(file).matchAll(/\bimport\s+[^;\n]*?["']([^"']+\.css)["']/g)].map(match => match[1]);
    if (file === "app/layout.tsx") assert.deepEqual(css, ["./globals.css"], "The layout must use a single global CSS entry.");
    else for (const name of css) assert(name.endsWith(".module.css"), `${file}: screen components must import CSS Modules.`);
  }
  if (file.startsWith("components/") && file.endsWith(".css")) {
    assert(file.endsWith(".module.css"), `${file}: component styles must be CSS Modules.`);
    if (legacyScreenModules.has(file)) {
      assert(source(file).includes(":where(.root)"), `${file}: keep legacy selector specificity when scoping screen styles.`);
    }
    assert(!/:global\(\s*(?:body|html|:root)\b/.test(source(file)), `${file}: document styles belong in styles/.`);
    modules.push(file);
  }
}
console.log(`CSS boundaries verified: one global entry, ${shared.length} shared stylesheets, ${modules.length} screen modules.`);
