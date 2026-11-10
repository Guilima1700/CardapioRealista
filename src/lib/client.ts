"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClientId } from "./client-id";
let client: SupabaseClient | undefined;
export function browserSupabase() {
  if (process.env.NEXT_PUBLIC_DATA_BACKEND !== "supabase") return undefined;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return undefined;
  return (client ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));
}
export async function api<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Falha de conexão. Tente novamente.");
  return data;
}
export function track(type: string, productId?: string, categoryId?: string) {
  try {
    let sessionId = sessionStorage.getItem("brasa_session");
    if (!sessionId) {
      sessionId = createClientId();
      sessionStorage.setItem("brasa_session", sessionId);
    }
    void api("/api/analytics", {
      method: "POST",
      body: JSON.stringify({ type, productId, categoryId, sessionId }),
    }).catch(() => {});
  } catch {}
}
