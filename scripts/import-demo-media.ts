// Imports the existing, explicitly illustrative demo GLBs through normal admin APIs.
// Does not seed/replace catalog, prices, staff, tables or orders.
import { loadEnvConfig } from "@next/env";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import type { Catalog, ProductAsset } from "../src/lib/types";
loadEnvConfig(process.cwd());
async function main() {
  const app = process.env.BRASA_VERIFY_APP_URL || "http://127.0.0.1:3002";
  const login = await fetch(app + "/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.DEMO_ADMIN_EMAIL,
      password: process.env.DEMO_ADMIN_PASSWORD,
    }),
  });
  assert.equal(
    login.status,
    200,
    "Não foi possível autenticar a demonstração. Nenhuma senha foi alterada.",
  );
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  const response = await fetch(app + "/api/admin", { headers: { cookie } });
  const { catalog }: { catalog: Catalog } = await response.json();
  for (const p of catalog.products) {
    const refresh =
      process.argv.includes("--refresh-demo") &&
      p.modelCredit?.includes("geométrico ilustrativo");
    if (!p.modelUrl?.startsWith("/models/") && !refresh) continue;
    const source = p.modelUrl?.startsWith("/models/")
      ? "public" + p.modelUrl
      : `public/models/${p.id === "smoked-bacon" ? "brasa-classic" : p.id}.glb`;
    const form = new FormData();
    form.set("productId", p.id);
    form.set("productName", p.name);
    form.set("widthCm", p.id === "rustic-fries" ? "25" : "16");
    form.set(
      "file",
      new File([readFileSync(source)], p.id + ".glb", {
        type: "model/gltf-binary",
      }),
    );
    const uploaded = await fetch(app + "/api/uploads", {
      method: "POST",
      headers: { cookie },
      body: form,
    });
    const asset: ProductAsset = await uploaded.json();
    assert.equal(uploaded.status, 200, JSON.stringify(asset));
    const product = {
      ...p,
      modelUrl: asset.url,
      modelAssetId: asset.id,
      model3dEnabled: true,
      arEnabled: true,
    };
    if (p.id === "brasa-classic" && !p.imageAssetId) {
      const url = new URL(p.image);
      url.searchParams.set("fm", "jpg");
      const image = await fetch(url);
      assert.equal(image.status, 200);
      const photo = new FormData();
      photo.set("productId", p.id);
      photo.set("productName", p.name);
      photo.set(
        "file",
        new File([await image.arrayBuffer()], "brasa-classic.jpg", {
          type: "image/jpeg",
        }),
      );
      const stored = await fetch(app + "/api/uploads", {
        method: "POST",
        headers: { cookie },
        body: photo,
      });
      const img: ProductAsset = await stored.json();
      assert.equal(stored.status, 200, JSON.stringify(img));
      product.image = img.url;
      product.imageAssetId = img.id;
    }
    const saved = await fetch(app + "/api/admin", {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "product", data: product }),
    });
    assert.equal(saved.status, 200, await saved.text());
    console.log(
      JSON.stringify({
        productId: p.id,
        storedInSupabase: true,
        modelAssetId: asset.id,
        physicalWidthCm: asset.dimensions?.widthCm,
        illustrative: true,
      }),
    );
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
