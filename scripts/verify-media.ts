// Real Supabase integration verification. Creates only its own media records;
// detaches and archives them afterwards. Does not delete any stored binary.
import { loadEnvConfig } from "@next/env";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { signAssetRequest, type AssetAction } from "../src/lib/asset-signing";
import { prepareAsset } from "../src/lib/model-files";
loadEnvConfig(process.cwd());
async function main() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    privateKey = process.env.BRASA_ASSET_PRIVATE_KEY!;
  assert.ok(
    base && key && privateKey,
    "Configure o módulo de mídia antes da verificação.",
  );
  async function call(
    action: AssetAction,
    body: Uint8Array,
    type = "application/json",
  ) {
    return fetch(base + "/functions/v1/brasa-media", {
      method: "POST",
      headers: {
        apikey: key,
        "X-Brasa-Authorization": signAssetRequest(
          action,
          body,
          "integration-verification",
          privateKey,
        ),
        "Content-Type": type,
      },
      body: body as BodyInit,
    });
  }
  const json = (action: AssetAction, data: unknown) =>
    call(action, Buffer.from(JSON.stringify(data)));
  const body = Buffer.from("{}"),
    token = signAssetRequest(
      "health",
      body,
      "integration-verification",
      privateKey,
    );
  const headers = {
    apikey: key,
    "Content-Type": "application/json",
    "X-Brasa-Authorization": token,
  };
  assert.equal(
    (
      await fetch(base + "/functions/v1/brasa-media", {
        method: "POST",
        headers: { apikey: key },
        body,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await fetch(base + "/functions/v1/brasa-media", {
        method: "POST",
        headers,
        body: '{"tampered":true}',
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await fetch(base + "/functions/v1/brasa-media", {
        method: "POST",
        headers,
        body,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(base + "/functions/v1/brasa-media", {
        method: "POST",
        headers,
        body,
      })
    ).status,
    409,
  );
  const pid = "verification-" + Date.now(),
    prepared = prepareAsset(
      readFileSync("public/models/brasa-classic.glb"),
      "classic.glb",
      23,
    );
  const form = new FormData();
  form.set("productId", pid);
  form.set("productName", "[VERIFICAÇÃO] Arquivo de integração");
  form.set("kind", "model");
  form.set("originalName", "verification.glb");
  form.set("mime", prepared.mime);
  form.set("sha256", prepared.sha256);
  form.set("dimensions", JSON.stringify(prepared.dimensions));
  form.set(
    "file",
    new File([new Uint8Array(prepared.bytes)], "verification.glb", {
      type: prepared.mime,
    }),
  );
  const packed = new Request("https://brasa.internal", {
    method: "POST",
    body: form,
  });
  const upload = await call(
    "upload",
    new Uint8Array(await packed.arrayBuffer()),
    packed.headers.get("content-type")!,
  );
  const asset = await upload.json();
  assert.equal(upload.status, 200, JSON.stringify(asset));
  const file = await fetch(asset.url, {
    headers: { Origin: "https://brasa.example" },
  });
  assert.equal(file.status, 200);
  assert.equal(file.headers.get("access-control-allow-origin"), "*");
  assert.equal(
    Buffer.from(await file.arrayBuffer())
      .subarray(0, 4)
      .toString(),
    "glTF",
  );
  const anonymous = await fetch(
    base + "/rest/v1/brasa_product_assets?select=id",
    { headers: { apikey: key } },
  );
  assert.ok(anonymous.status >= 400);
  const denied = await fetch(
    base + "/storage/v1/object/brasa-product-media/unauthorized.glb",
    {
      method: "POST",
      headers: { apikey: key, "Content-Type": prepared.mime },
      body: new Uint8Array(prepared.bytes),
    },
  );
  assert.ok(denied.status >= 400);
  const deniedBody = await denied.json();
  assert.notEqual(deniedBody.Key, "brasa-product-media/unauthorized.glb");
  const document = {
    productId: pid,
    name: "[VERIFICAÇÃO]",
    modelUrl: asset.url,
    modelAssetId: asset.id,
    model3dEnabled: true,
    arEnabled: true,
  };
  assert.equal((await json("publish", document)).status, 200);
  assert.ok(
    (await json("publish", { ...document, productId: pid + "-other" }))
      .status >= 400,
  );
  assert.equal((await json("archive", { id: asset.id })).status, 409);
  const listed = await (await json("list", { productId: pid })).json();
  assert.ok(listed.some((x: { id: string }) => x.id === asset.id));
  assert.equal(
    (
      await json("publish", {
        productId: pid,
        name: "[VERIFICAÇÃO]",
        model3dEnabled: false,
        arEnabled: false,
      })
    ).status,
    200,
  );
  assert.equal((await json("archive", { id: asset.id })).status, 200);
  assert.equal(
    (await (await json("list", { productId: pid })).json()).length,
    0,
  );
  console.log(
    JSON.stringify({
      ok: true,
      authentication: "anonymous/tamper/replay rejected",
      storage: "public GLB+CORS; anonymous write/metadata denied",
      association: "ownership and active archive enforced",
      cleanup: "own verification asset archived; binary retained",
      productId: pid,
    }),
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
