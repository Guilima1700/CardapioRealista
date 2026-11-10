// Repairs only the two known broken demo URLs; preserves custom photographs.
import { loadEnvConfig } from "@next/env";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import type { Catalog, ProductAsset } from "../src/lib/types";
loadEnvConfig(process.cwd());
async function main() {
  const base = process.env.BRASA_VERIFY_APP_URL || "http://localhost:3003";
  const response = await fetch(base + "/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.DEMO_ADMIN_EMAIL,
      password: process.env.DEMO_ADMIN_PASSWORD,
    }),
  });
  assert.equal(
    response.status,
    200,
    "Não foi possível autenticar. Nenhuma credencial foi modificada.",
  );
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  const { catalog }: { catalog: Catalog } = await (
    await fetch(base + "/api/admin", { headers: { cookie } })
  ).json();
  const fixes = [
    {
      id: "smoked-bacon",
      broken: "photo-1553979459-d2229ba7433a",
      file: "demo-smoked-bacon.jpg",
    },
    {
      id: "lemonade",
      broken: "photo-1513558161293-cdaf765edfd7",
      file: "demo-lemonade.jpg",
    },
  ];
  await writeFile(
    ".tools/image-repair-before.json",
    JSON.stringify(
      catalog.products.filter((p) => fixes.some((f) => f.id === p.id)),
      null,
      2,
    ),
  );
  for (const fix of fixes) {
    const p = catalog.products.find((p) => p.id === fix.id);
    if (!p?.image.includes(fix.broken)) continue;
    const form = new FormData();
    form.set("productId", p.id);
    form.set("productName", p.name);
    form.set(
      "file",
      new File(
        [new Uint8Array(await readFile("public/images/" + fix.file))],
        fix.file,
        { type: "image/jpeg" },
      ),
    );
    const uploaded = await fetch(base + "/api/uploads", {
      method: "POST",
      headers: { cookie },
      body: form,
    });
    const asset: ProductAsset = await uploaded.json();
    assert.equal(uploaded.status, 200, JSON.stringify(asset));
    const saved = await fetch(base + "/api/admin", {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "product",
        data: { ...p, image: asset.url, imageAssetId: asset.id },
      }),
    });
    assert.equal(saved.status, 200, await saved.text());
    console.log(
      JSON.stringify({
        productId: p.id,
        repaired: true,
        publicImageStatus: (await fetch(asset.url)).status,
      }),
    );
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
