import { readFile } from "node:fs/promises";
import path from "node:path";
import { endpoint } from "@/lib/server/http";
import { AppError } from "@/lib/validation";
export const GET = endpoint(async (_request, context) => {
  const { name } = await context.params;
  if (!/^[a-f0-9-]{36}\.(glb|usdz|jpg|jpeg|png|webp)$/.test(name))
    throw new AppError("Arquivo não encontrado.", 404);
  const types: Record<string, string> = {
    glb: "model/gltf-binary",
    usdz: "model/vnd.usdz+zip",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  try {
    const bytes = await readFile(
      path.resolve(process.env.DATA_DIR || "./data", "uploads", name),
    );
    return new Response(bytes, {
      headers: {
        "Content-Type": types[name.split(".").at(-1)!],
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    throw new AppError("Arquivo não encontrado.", 404);
  }
});
