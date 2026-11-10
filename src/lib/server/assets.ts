import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { signAssetRequest, type AssetAction } from "../asset-signing";
import { AppError } from "../validation";
import { prepareAsset } from "../model-files";
import type { Product, ProductAsset } from "../types";
import { localDb, supabase } from "./db";
export const assetBackend =
  process.env.ASSET_BACKEND === "supabase" ? "supabase" : "local";
export async function mediaGateway<T>(
  action: AssetAction,
  body: Uint8Array,
  actor: string,
  contentType = "application/json",
): Promise<T> {
  const key = process.env.BRASA_ASSET_PRIVATE_KEY,
    url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    apiKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key || !url || !apiKey)
    throw new AppError("O módulo de mídia Supabase não está configurado.", 503);
  const token = signAssetRequest(action, body, actor, key);
  let response: Response;
  try {
    response = await fetch(`${url}/functions/v1/brasa-media`, {
      method: "POST",
      headers: {
        apikey: apiKey,
        "X-Brasa-Authorization": token,
        "Content-Type": contentType,
      },
      body: body as BodyInit,
      signal: AbortSignal.timeout(60000),
      cache: "no-store",
    });
  } catch {
    throw new AppError(
      "Não foi possível acessar o acervo. Tente novamente; o pedido não foi alterado.",
      503,
    );
  }
  const result = await response
    .json()
    .catch(() => ({ error: "Resposta inválida do acervo." }));
  if (!response.ok)
    throw new AppError(
      result.error || "Não foi possível concluir a operação no acervo.",
      response.status >= 500 ? 503 : response.status,
    );
  return result as T;
}
async function gatewayJSON<T>(
  action: AssetAction,
  value: unknown,
  actor: string,
) {
  return mediaGateway<T>(action, Buffer.from(JSON.stringify(value)), actor);
}
function assetDb() {
  const db = localDb();
  db.exec(
    "CREATE TABLE IF NOT EXISTS managed_product_assets(id TEXT PRIMARY KEY,product_id TEXT NOT NULL,kind TEXT NOT NULL,url TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL,archived_at TEXT); CREATE INDEX IF NOT EXISTS managed_assets_product ON managed_product_assets(product_id,archived_at)",
  );
  return db;
}
export async function uploadProductAsset(
  file: File,
  productId: string,
  productName: string,
  actor: string,
  widthCm?: number,
): Promise<ProductAsset> {
  const prepared = prepareAsset(
    Buffer.from(await file.arrayBuffer()),
    file.name,
    widthCm,
  );
  if (assetBackend === "supabase") {
    const form = new FormData();
    form.set("productId", productId);
    form.set("productName", productName);
    form.set("kind", prepared.kind);
    form.set("originalName", file.name);
    form.set("mime", prepared.mime);
    form.set("sha256", prepared.sha256);
    if (prepared.dimensions)
      form.set("dimensions", JSON.stringify(prepared.dimensions));
    form.set(
      "file",
      new File(
        [new Uint8Array(prepared.bytes)],
        `${randomUUID()}${prepared.extension}`,
        { type: prepared.mime },
      ),
    );
    const request = new Request("https://brasa.internal/upload", {
      method: "POST",
      body: form,
    });
    return mediaGateway(
      "upload",
      new Uint8Array(await request.arrayBuffer()),
      actor,
      request.headers.get("content-type")!,
    );
  }
  if (process.env.DATA_BACKEND === "supabase") {
    const name = `${productId}/${randomUUID()}${prepared.extension}`;
    const { error } = await supabase()
      .storage.from("product-assets")
      .upload(name, prepared.bytes, {
        contentType: prepared.mime,
        upsert: false,
      });
    if (error)
      throw new AppError("Não foi possível enviar para o Storage.", 503);
    return {
      id: randomUUID(),
      productId,
      kind: prepared.kind,
      url: supabase().storage.from("product-assets").getPublicUrl(name).data
        .publicUrl,
      originalName: file.name,
      bytes: prepared.bytes.length,
      mime: prepared.mime,
      sha256: prepared.sha256,
      dimensions: prepared.dimensions,
      createdAt: new Date().toISOString(),
    };
  }
  const id = randomUUID(),
    filename = `${id}${prepared.extension}`;
  const dir = path.resolve(process.env.DATA_DIR || "./data", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), prepared.bytes);
  const asset: ProductAsset = {
    id,
    productId,
    kind: prepared.kind,
    url: `/uploads/${filename}`,
    originalName: file.name,
    bytes: prepared.bytes.length,
    mime: prepared.mime,
    sha256: prepared.sha256,
    dimensions: prepared.dimensions,
    createdAt: new Date().toISOString(),
  };
  assetDb()
    .prepare("INSERT INTO managed_product_assets VALUES(?,?,?,?,?,?,NULL)")
    .run(
      id,
      productId,
      asset.kind,
      asset.url,
      JSON.stringify(asset),
      asset.createdAt,
    );
  return asset;
}
export async function listProductAssets(
  productId: string,
  actor: string,
): Promise<ProductAsset[]> {
  if (assetBackend === "supabase")
    return gatewayJSON("list", { productId }, actor);
  if (process.env.DATA_BACKEND === "supabase") return [];
  return assetDb()
    .prepare(
      "SELECT data FROM managed_product_assets WHERE product_id=? AND archived_at IS NULL ORDER BY created_at DESC",
    )
    .all(productId)
    .map((row) => JSON.parse(row.data as string));
}
export async function publishProductMedia(product: Product, actor: string) {
  if (assetBackend === "supabase")
    await gatewayJSON(
      "publish",
      {
        productId: product.id,
        name: product.name,
        image: product.image,
        modelUrl: product.modelUrl || null,
        usdzUrl: product.usdzUrl || null,
        imageAssetId: product.imageAssetId || null,
        modelAssetId: product.modelAssetId || null,
        usdzAssetId: product.usdzAssetId || null,
        model3dEnabled: !!product.modelUrl && product.model3dEnabled !== false,
        arEnabled:
          !!product.modelUrl &&
          product.model3dEnabled !== false &&
          product.arEnabled !== false,
        presentation: product.modelPresentation || {},
      },
      actor,
    );
  else if (process.env.DATA_BACKEND !== "supabase") {
    const db = assetDb();
    for (const url of [product.image, product.modelUrl, product.usdzUrl]) {
      if (url) {
        const candidate = db
          .prepare("SELECT product_id FROM managed_product_assets WHERE url=?")
          .get(url) as { product_id: string } | undefined;
        if (candidate && candidate.product_id !== product.id)
          throw new AppError("Esse arquivo pertence a outro produto.", 409);
      }
    }
  }
}
export async function archiveProductAsset(id: string, actor: string) {
  if (assetBackend === "supabase") return gatewayJSON("archive", { id }, actor);
  const db = assetDb();
  const row = db
    .prepare("SELECT * FROM managed_product_assets WHERE id=?")
    .get(id) as { product_id: string; url: string; data: string } | undefined;
  if (!row) throw new AppError("Arquivo não encontrado.", 404);
  const product = db
    .prepare("SELECT data FROM menu_items WHERE id=?")
    .get(row.product_id) as { data: string } | undefined;
  if (product) {
    const p = JSON.parse(product.data);
    if ([p.image, p.modelUrl, p.usdzUrl].includes(row.url))
      throw new AppError(
        "Remova a associação e salve o produto antes de arquivar este arquivo.",
        409,
      );
  }
  const at = new Date().toISOString();
  db.prepare(
    "UPDATE managed_product_assets SET archived_at=?,data=? WHERE id=?",
  ).run(at, JSON.stringify({ ...JSON.parse(row.data), archivedAt: at }), id);
  return { ok: true };
}
