import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "../validation";
const buckets = new Map<string, { count: number; reset: number }>();
export function rateLimit(
  request: NextRequest,
  scope: string,
  max: number,
  window = 60000,
) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const key = `${scope}:${ip}`;
  const now = Date.now();
  if (buckets.size > 10000)
    for (const [key, bucket] of buckets)
      if (bucket.reset < now) buckets.delete(key);
  const bucket = buckets.get(key);
  if (!bucket || bucket.reset < now) {
    buckets.set(key, { count: 1, reset: now + window });
    return;
  }
  if (++bucket.count > max)
    throw new AppError(
      "Muitas tentativas. Aguarde um minuto e tente novamente.",
      429,
    );
}
export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  let matchesHost = false;
  try {
    matchesHost =
      !!origin && new URL(origin).host === request.headers.get("host");
  } catch {}
  if (
    origin &&
    !matchesHost &&
    origin !== request.nextUrl.origin &&
    origin !== configured
  )
    throw new AppError("Origem não autorizada.", 403);
  if (!origin && request.headers.get("sec-fetch-site") === "cross-site")
    throw new AppError("Origem não autorizada.", 403);
}
export async function body(request: NextRequest) {
  if (Number(request.headers.get("content-length") || 0) > 100000)
    throw new AppError("Requisição muito grande.", 413);
  const text = await request.text();
  if (Buffer.byteLength(text) > 100000)
    throw new AppError("Requisição muito grande.", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("JSON inválido.");
  }
}
export function endpoint(
  fn: (request: NextRequest, context: any) => Promise<unknown>,
) {
  return async (request: NextRequest, context: any) => {
    try {
      if (!["GET", "HEAD"].includes(request.method)) sameOrigin(request);
      const value = await fn(request, context);
      return value instanceof Response
        ? value
        : NextResponse.json(value, {
            headers: { "Cache-Control": "no-store" },
          });
    } catch (error) {
      if (error instanceof ZodError)
        return NextResponse.json(
          { error: error.issues[0]?.message || "Dados inválidos." },
          { status: 400 },
        );
      if (error instanceof AppError)
        return NextResponse.json(
          { error: error.message },
          { status: error.status },
        );
      console.error(error);
      return NextResponse.json(
        { error: "Não foi possível concluir. Tente novamente." },
        { status: 500 },
      );
    }
  };
}
