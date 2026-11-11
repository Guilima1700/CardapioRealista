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
let fallbackSession = "";
let analyticsTableId: string | undefined;
const viewEvents = new Map<string, string>();
export function analyticsSessionId() {
  try {
    const id = sessionStorage.getItem("brasa_session");
    if (id && /^[a-f0-9-]{36}$/i.test(id)) return id;
    if (!fallbackSession) fallbackSession = createClientId();
    sessionStorage.setItem("brasa_session", fallbackSession);
    return fallbackSession;
  } catch {
    if (!fallbackSession) fallbackSession = createClientId();
    return fallbackSession;
  }
}
export function setAnalyticsTable(id?: string) {
  analyticsTableId = id;
}
export function track(
  type: string,
  productId?: string,
  categoryId?: string,
  metadata?: { modifierId?: string; recommendationId?: string },
) {
  try {
    const sessionId = analyticsSessionId(),
      key = [
        sessionId,
        type,
        productId,
        categoryId,
        metadata?.recommendationId,
      ].join(":");
    const unique = [
      "menu_open",
      "category_view",
      "product_view",
      "model_view",
      "ar_start",
      "recommendation_view",
    ].includes(type);
    const id = unique
      ? viewEvents.get(key) || createClientId()
      : createClientId();
    if (unique) viewEvents.set(key, id);
    void api("/api/analytics", {
      method: "POST",
      body: JSON.stringify({
        id,
        type,
        productId,
        categoryId,
        sessionId,
        tableId: analyticsTableId,
        metadata,
      }),
    }).catch(() => {});
  } catch {}
}
