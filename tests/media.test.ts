import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateKeyPairSync, verify, createHash } from "node:crypto";
import { prepareAsset, encodeGlb } from "../src/lib/model-files";
import { signAssetRequest } from "../src/lib/asset-signing";
import { hasModel3d, hasProductAR } from "../src/lib/product-media";
import { seed } from "../src/lib/seed";
import { priceCart, productSchema } from "../src/lib/validation";

const model = readFileSync("public/models/brasa-classic.glb");
const json = (bytes: Buffer) =>
  JSON.parse(bytes.toString("utf8", 20, 20 + bytes.readUInt32LE(12)).trim());
test("calibração mede vértices rotacionados sem inflar a caixa delimitadora", () => {
  const positions = new Float32Array([1, 0, 0, -1, 0, 0, 0, 1, 1]);
  const doc = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      {
        mesh: 0,
        rotation: [0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)],
      },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: "VEC3",
        min: [-1, 0, 0],
        max: [1, 1, 1],
      },
    ],
    bufferViews: [{ buffer: 0, byteLength: positions.byteLength }],
    buffers: [{ byteLength: positions.byteLength }],
  };
  const normalized = prepareAsset(
    encodeGlb(doc, Buffer.from(positions.buffer)),
    "rotated.glb",
    20,
  );
  const packed = json(normalized.bytes),
    root = packed.nodes[packed.scenes[0].nodes[0]];
  assert.ok(Math.abs(root.scale[0] - 0.2 / Math.sqrt(2)) < 1e-6);
});
test("GLB é calibrado no arquivo, centralizado e apoiado na base", () => {
  const asset = prepareAsset(model, "burger.glb", 24);
  assert.equal(asset.mime, "model/gltf-binary");
  assert.equal(asset.kind, "model");
  assert.ok(Math.abs(asset.dimensions!.widthCm - 24) < 1e-6);
  const doc = json(asset.bytes),
    root = doc.nodes[doc.scenes[doc.scene ?? 0].nodes[0]];
  assert.ok(root.name.includes("escala física"));
  assert.ok(root.translation.every(Number.isFinite));
  const again = prepareAsset(asset.bytes, "calibrated.glb");
  assert.ok(Math.abs(again.dimensions!.widthCm - 24) < 1e-6);
  assert.equal(
    asset.sha256,
    createHash("sha256").update(asset.bytes).digest("hex"),
  );
});
test("GLTF autocontido vira GLB sem dependências externas", () => {
  const doc = json(model),
    offset = 20 + model.readUInt32LE(12);
  const bin = model.subarray(
    offset + 8,
    offset + 8 + model.readUInt32LE(offset),
  );
  doc.buffers[0].uri =
    "data:application/octet-stream;base64," + bin.toString("base64");
  const asset = prepareAsset(
    Buffer.from(JSON.stringify(doc)),
    "embedded.gltf",
    18,
  );
  const packed = json(asset.bytes);
  assert.equal(packed.buffers.length, 1);
  assert.equal(packed.buffers[0].uri, undefined);
  assert.equal(asset.extension, ".glb");
  assert.ok(Math.abs(asset.dimensions!.widthCm - 18) < 1e-6);
  doc.buffers[0].uri = "https://example.org/mesh.bin";
  assert.throws(
    () => prepareAsset(Buffer.from(JSON.stringify(doc)), "external.gltf"),
    /autocontido/,
  );
});
test("GLB truncado, escala inválida, executável e cena cíclica são rejeitados", () => {
  assert.throws(
    () => prepareAsset(model.subarray(0, model.length - 1), "broken.glb"),
    /GLB inválido/,
  );
  assert.throws(() => prepareAsset(model, "burger.glb", 0), /largura real/);
  assert.throws(
    () => prepareAsset(Buffer.from("MZ executable"), "fake.png"),
    /Arquivo inválido/,
  );
  const doc = json(model);
  doc.nodes[doc.scenes[doc.scene ?? 0].nodes[0]].children = [
    doc.scenes[doc.scene ?? 0].nodes[0],
  ];
  const offset = 20 + model.readUInt32LE(12);
  doc.buffers[0].uri =
    "data:application/octet-stream;base64," +
    model
      .subarray(offset + 8, offset + 8 + model.readUInt32LE(offset))
      .toString("base64");
  assert.throws(
    () => prepareAsset(Buffer.from(JSON.stringify(doc)), "cycle.gltf"),
    /Hierarquia/,
  );
});
test("habilitação 3D/AR respeita o produto sem alterar preço e adicionais", () => {
  const p = { ...seed.products[0], model3dEnabled: false, arEnabled: false };
  assert.equal(hasModel3d(p), false);
  assert.equal(hasProductAR(p), false);
  assert.equal(hasProductAR({ ...p, model3dEnabled: true }), false);
  assert.equal(
    productSchema.safeParse({ ...p, arEnabled: true }).success,
    false,
  );
  assert.equal(
    hasProductAR({ ...p, model3dEnabled: true, arEnabled: true }),
    true,
  );
  const line = {
    productId: p.id,
    quantity: 1,
    modifierIds: ["brioche", "medium", "bacon"],
    notes: "",
  };
  assert.deepEqual(
    priceCart([line], seed),
    priceCart([line], {
      ...seed,
      products: seed.products.map((item) => (item.id === p.id ? p : item)),
    }),
  );
});
test("autorização de mídia usa assinatura Ed25519, corpo e prazo curto", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const body = Buffer.from('{"productId":"burger"}');
  const token = signAssetRequest(
    "list",
    body,
    "admin-test",
    privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"),
  );
  const [header, claims, signature] = token.split(".");
  assert.ok(
    verify(
      null,
      Buffer.from(header + "." + claims),
      publicKey,
      Buffer.from(signature, "base64url"),
    ),
  );
  const payload = JSON.parse(Buffer.from(claims, "base64url").toString());
  assert.equal(payload.action, "list");
  assert.equal(payload.exp - payload.iat, 60);
  assert.equal(
    payload.bodyHash,
    createHash("sha256").update(body).digest("hex"),
  );
  assert.notEqual(
    payload.bodyHash,
    createHash("sha256").update("{}").digest("hex"),
  );
});
