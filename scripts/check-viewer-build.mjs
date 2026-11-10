import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

// Inspect emitted browser code, not source maps or server-only dependencies.
const root = path.resolve(process.env.NEXT_DIST_DIR || ".next", "static");
const files = [];
function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (entry.name.endsWith(".js")) files.push(file);
  }
}
visit(root);
const bundle = files.map((file) => readFileSync(file, "utf8")).join("\n");
assert.ok(
  bundle.includes("reactiveElementVersions"),
  "Lit/Model Viewer não foi encontrado no bundle de navegador.",
);
assert.ok(
  bundle.includes("litHtmlVersions"),
  "O runtime Lit HTML não foi encontrado.",
);
for (const marker of ["Lit is in dev mode", "change-in-update", "lit-debug"])
  assert.ok(
    !bundle.includes(marker),
    `Código de desenvolvimento do Lit no bundle de produção: ${marker}`,
  );
assert.ok(
  !bundle.includes("react-dom-client.development.js"),
  "React DOM de desenvolvimento no bundle de produção.",
);
assert.ok(
  !bundle.includes(
    "Download the React DevTools for a better development experience",
  ),
  "Inicialização de desenvolvimento do React DOM no bundle de produção.",
);
console.log(
  JSON.stringify({
    browserScripts: files.length,
    litRuntimePresent: true,
    litDevelopmentCode: false,
    reactDomDevelopmentModule: false,
  }),
);
