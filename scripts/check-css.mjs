import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = (file) => readFileSync(path.join(root, file), "utf8");
function files(directory) {
  return readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`],
  );
}

const allFiles = files("src");
const modules = allFiles.filter((file) => file.endsWith(".module.css"));
const globalCSS = allFiles.filter((file) => file.endsWith(".css") && !file.endsWith(".module.css"));
assert(
  globalCSS.every((file) => file === "src/app/globals.css" || file.startsWith("src/styles/")),
  "Global CSS belongs in the root entry or src/styles; colocate component styles as CSS Modules.",
);

const uses = new Map();
for (const file of allFiles.filter((file) => /\.[jt]sx?$/.test(file))) {
  const text = source(file);
  const syntax = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const imports = new Map();
  for (const statement of syntax.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    const reference = statement.moduleSpecifier.text;
    if (!reference.endsWith(".css")) {
      continue;
    }
    if (!reference.endsWith(".module.css")) {
      assert.equal(file, "src/app/layout.tsx", `${file}: only the root layout imports global CSS.`);
      assert.equal(reference, "@/app/globals.css", "Use a single global CSS entry.");
      continue;
    }
    const stylesheet = reference.startsWith("@/")
      ? `src/${reference.slice(2)}`
      : path.posix.normalize(path.posix.join(path.posix.dirname(file), reference));
    assert(modules.includes(stylesheet), `${file}: missing CSS Module ${stylesheet}.`);
    if (statement.importClause?.name) {
      imports.set(statement.importClause.name.text, stylesheet);
    }
  }
  function visit(node) {
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      const stylesheet = imports.get(node.expression.text);
      if (stylesheet) {
        const names = uses.get(stylesheet) ?? new Set();
        names.add(node.name.text);
        uses.set(stylesheet, names);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(syntax);
}

for (const file of modules) {
  const css = source(file);
  const syntax = postcss.parse(css, { from: file });
  syntax.walkRules((rule) =>
    assert(
      !/:global\(\s*(?:body|html|:root)\b/.test(rule.selector),
      `${file}: document styles belong in src/styles.`,
    ),
  );
  if (!file.startsWith("src/features/atelier/components/")) {
    continue;
  }
  assert(
    css.split("\n").length <= 800,
    `${file}: split styles by component responsibility before exceeding 800 lines.`,
  );
  assert(
    !/@value\b|:import\(|:export\b/.test(css),
    `${file}: use CSS supported by both Turbopack and webpack.`,
  );
  const declared = new Set();
  syntax.walkRules((rule) => {
    const local = rule.selector.replace(/:global\([^)]*\)/g, "").replace(/"[^"]*"|'[^']*'/g, "");
    for (const match of local.matchAll(/\.([a-zA-Z][\w-]*)/g)) {
      declared.add(match[1]);
    }
  });
  const referenced = uses.get(file) ?? new Set();
  for (const name of referenced) {
    assert(declared.has(name), `${file}: referenced class ${name} is missing.`);
  }
  for (const name of declared) {
    assert(/^[a-z][a-zA-Z0-9]*$/.test(name), `${file}: use semantic camelCase class names.`);
    assert(referenced.has(name), `${file}: local class ${name} is unused.`);
  }
}
console.log(`CSS verified: ${modules.length} colocated/shared modules, one global entry.`);
