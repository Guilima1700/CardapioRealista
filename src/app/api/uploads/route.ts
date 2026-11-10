import { z } from "zod";
import { endpoint, rateLimit } from "@/lib/server/http";
import { requireStaff } from "@/lib/server/auth";
import { uploadProductAsset } from "@/lib/server/assets";
import { MAX_ASSET_BYTES } from "@/lib/model-files";
import { AppError } from "@/lib/validation";
export const POST = endpoint(async (request) => {
  const session = await requireStaff(true);
  rateLimit(request, "upload", 15);
  const max = MAX_ASSET_BYTES;
  if (Number(request.headers.get("content-length") || 0) > max + 10000)
    throw new AppError("O limite é de 30 MB por arquivo.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("Selecione um arquivo.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max + 20000) {
      await reader.cancel();
      throw new AppError("O limite é de 30 MB por arquivo.", 413);
    }
    chunks.push(value);
  }
  const form = await new Response(Buffer.concat(chunks), {
    headers: { "Content-Type": request.headers.get("content-type") || "" },
  }).formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError("Selecione um arquivo.");
  if (file.size > max)
    throw new AppError("O limite é de 30 MB por arquivo.", 413);
  const productId = z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .max(100)
    .parse(form.get("productId") || "unassigned");
  const productName = z
    .string()
    .max(100)
    .parse(form.get("productName") || productId);
  const width = form.get("widthCm");
  const widthCm = width
    ? z.coerce.number().min(1).max(200).parse(width)
    : undefined;
  return uploadProductAsset(file, productId, productName, session.id, widthCm);
});
