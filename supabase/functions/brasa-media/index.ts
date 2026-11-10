import { createClient } from "@supabase/supabase-js";
import publicKey from "./public-key.json" with { type: "json" };
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};
const BUCKET = "brasa-product-media",
  MAX = 30 * 1024 * 1024;
const actions = new Set(["upload", "publish", "list", "archive", "health"]);
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
function decode(value: string) {
  return Uint8Array.from(
    atob(
      value
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(value.length / 4) * 4, "="),
    ),
    (c) => c.charCodeAt(0),
  );
}
const importedKey = crypto.subtle.importKey(
  "jwk",
  publicKey,
  { name: "Ed25519" },
  false,
  ["verify"],
);
const hex = (value: ArrayBuffer) =>
  Array.from(new Uint8Array(value), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
function mapAsset(a: any) {
  return {
    id: a.id,
    productId: a.product_id,
    kind: a.kind,
    url: a.url,
    originalName: a.original_name,
    bytes: a.byte_size,
    mime: a.mime,
    sha256: a.sha256,
    dimensions: a.dimensions || undefined,
    createdAt: a.created_at,
    archivedAt: a.archived_at,
  };
}
Deno.serve(async (request) => {
  if (request.method !== "POST")
    return json({ error: "Método não permitido." }, 405);
  try {
    // This is server-to-server authorization. An anon/publishable key is not authorization.
    const token = request.headers.get("X-Brasa-Authorization") || "";
    if (token.length > 4096) return json({ error: "Não autorizado." }, 401);
    const [header, payload, signature, ...extra] = token.split(".");
    if (!header || !payload || !signature || extra.length)
      return json({ error: "Não autorizado." }, 401);
    let claims: any, algorithm: any;
    try {
      claims = JSON.parse(new TextDecoder().decode(decode(payload)));
      algorithm = JSON.parse(new TextDecoder().decode(decode(header)));
    } catch {
      return json({ error: "Não autorizado." }, 401);
    }
    const now = Math.floor(Date.now() / 1000);
    if (
      algorithm.alg !== "EdDSA" ||
      algorithm.typ !== "JWT" ||
      claims.iss !== "brasa-server" ||
      claims.aud !== "brasa-media" ||
      !actions.has(claims.action) ||
      typeof claims.actor !== "string" ||
      !claims.actor ||
      !Number.isInteger(claims.iat) ||
      !Number.isInteger(claims.exp) ||
      claims.exp < now ||
      claims.iat > now + 5 ||
      claims.exp - claims.iat > 60 ||
      claims.exp <= claims.iat ||
      !/^[-a-f0-9]{36}$/.test(claims.jti) ||
      !/^[a-f0-9]{64}$/.test(claims.bodyHash)
    )
      return json({ error: "Não autorizado." }, 401);
    const valid = await crypto.subtle.verify(
      "Ed25519",
      await importedKey,
      decode(signature),
      new TextEncoder().encode(`${header}.${payload}`),
    );
    if (!valid) return json({ error: "Não autorizado." }, 401);
    if (Number(request.headers.get("content-length") || 0) > MAX + 20000)
      return json({ error: "Arquivo muito grande." }, 413);
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Corpo ausente." }, 400);
    const pieces: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX + 20000) {
        await reader.cancel();
        return json({ error: "Arquivo muito grande." }, 413);
      }
      pieces.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const piece of pieces) {
      bytes.set(piece, offset);
      offset += piece.length;
    }
    if (hex(await crypto.subtle.digest("SHA-256", bytes)) !== claims.bodyHash)
      return json({ error: "Requisição alterada." }, 401);
    if (claims.exp < Math.floor(Date.now() / 1000))
      return json({ error: "Requisição expirada." }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const secrets = Deno.env.get("SUPABASE_SECRET_KEYS");
    const key = secrets
      ? JSON.parse(secrets).default
      : Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const db = createClient(url, key!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: nonceError } = await db
      .from("brasa_media_request_nonces")
      .insert({
        id: claims.jti,
        expires_at: new Date(claims.exp * 1000).toISOString(),
      });
    if (nonceError)
      return json({ error: "Requisição já utilizada ou indisponível." }, 409);
    if (claims.action === "health")
      return json({
        ok: true,
        bucket: BUCKET,
        authorization: "ed25519-body-bound",
      });
    if (claims.action === "upload") {
      const form = await new Response(bytes, {
        headers: { "Content-Type": request.headers.get("content-type") || "" },
      }).formData();
      const file = form.get("file"),
        pid = String(form.get("productId") || ""),
        name = String(form.get("productName") || pid),
        kind = String(form.get("kind") || ""),
        mime = String(form.get("mime") || "");
      if (
        !(file instanceof File) ||
        !file.size ||
        file.size > MAX ||
        !/^[a-z0-9-]{1,100}$/.test(pid) ||
        name.length > 100 ||
        !["image", "model", "usdz"].includes(kind)
      )
        return json({ error: "Arquivo ou produto inválido." }, 400);
      const extensions: Record<string, string> = {
        "model/gltf-binary": ".glb",
        "model/vnd.usdz+zip": ".usdz",
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
      };
      const ext = extensions[mime];
      if (
        !ext ||
        (kind === "model" && ext !== ".glb") ||
        (kind === "usdz" && ext !== ".usdz") ||
        (kind === "image" && !mime.startsWith("image/"))
      )
        return json({ error: "Formato inválido." }, 400);
      const content = new Uint8Array(await file.arrayBuffer()),
        sha = hex(await crypto.subtle.digest("SHA-256", content));
      if (sha !== form.get("sha256"))
        return json({ error: "Arquivo alterado." }, 400);
      const product = await db
        .from("brasa_media_products")
        .upsert({
          id: pid,
          name: name || pid,
          updated_at: new Date().toISOString(),
        });
      if (product.error) throw product.error;
      const id = crypto.randomUUID(),
        objectPath = `${pid}/${id}${ext}`;
      const upload = await db.storage
        .from(BUCKET)
        .upload(objectPath, content, {
          contentType: mime,
          upsert: false,
          cacheControl: "31536000",
        });
      if (upload.error) throw upload.error;
      const publicUrl = db.storage.from(BUCKET).getPublicUrl(objectPath)
        .data.publicUrl;
      const dimensions = form.get("dimensions")
        ? JSON.parse(String(form.get("dimensions")))
        : null;
      const inserted = await db
        .from("brasa_product_assets")
        .insert({
          id,
          product_id: pid,
          kind,
          url: publicUrl,
          bucket: BUCKET,
          object_path: objectPath,
          original_name: String(form.get("originalName") || file.name).slice(
            0,
            250,
          ),
          byte_size: file.size,
          mime,
          sha256: sha,
          dimensions,
          created_by: claims.actor,
        })
        .select()
        .single();
      if (inserted.error) throw inserted.error;
      return json(mapAsset(inserted.data));
    }
    if (bytes.length > 100000)
      return json({ error: "Requisição muito grande." }, 413);
    let data: any;
    try {
      data = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return json({ error: "JSON inválido." }, 400);
    }
    if (claims.action === "list") {
      if (!/^[a-z0-9-]{1,100}$/.test(data.productId || ""))
        return json({ error: "Produto inválido." }, 400);
      const result = await db
        .from("brasa_product_assets")
        .select("*")
        .eq("product_id", data.productId)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(100);
      if (result.error) throw result.error;
      return json((result.data || []).map(mapAsset));
    }
    if (claims.action === "publish") {
      const result = await db.rpc("brasa_publish_product_media", {
        p_document: data,
        p_actor: claims.actor,
      });
      if (result.error)
        return json(
          {
            error:
              "O arquivo não pertence a este produto, está arquivado ou a configuração é inválida.",
          },
          409,
        );
      return json(result.data);
    }
    if (claims.action === "archive") {
      if (!/^[a-f0-9-]{36}$/.test(data.id || ""))
        return json({ error: "Arquivo inválido." }, 400);
      const result = await db.rpc("brasa_archive_product_asset", {
        p_id: data.id,
      });
      if (result.error)
        return json(
          {
            error:
              "Remova a associação e salve o produto antes de arquivar este arquivo.",
          },
          409,
        );
      if (!result.data) return json({ error: "Arquivo não encontrado." }, 404);
      return json({ ok: true });
    }
    return json({ error: "Operação inválida." }, 400);
  } catch (error) {
    console.error(
      "Media operation failed",
      error instanceof Error ? error.message : "internal error",
    );
    return json(
      { error: "Não foi possível concluir a operação do acervo." },
      503,
    );
  }
});
