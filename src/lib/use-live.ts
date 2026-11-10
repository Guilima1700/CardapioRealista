"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, browserSupabase } from "./client";
import { createClientId } from "./client-id";
export function useLive<T>(
  url: string,
  {
    initial,
    orderToken,
    staff = false,
  }: { initial: T; orderToken?: string; staff?: boolean },
) {
  const [data, setData] = useState<T>(initial),
    [connected, setConnected] = useState(true),
    [error, setError] = useState(""),
    [realtime, setRealtime] = useState(false);
  const inFlight = useRef(false);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const next = await api<T>(url);
      setData(next);
      setConnected(true);
      setError("");
    } catch (e) {
      setConnected(false);
      setError((e as Error).message);
    } finally {
      inFlight.current = false;
    }
  }, [url]);
  useEffect(() => {
    void refresh();
    const interval = setInterval(refresh, 2500);
    const focus = () => void refresh();
    const offline = () => setConnected(false);
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    window.addEventListener("offline", offline);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", focus);
      window.removeEventListener("offline", offline);
    };
  }, [refresh]);
  useEffect(() => {
    const client = browserSupabase();
    if (!client) return;
    let disposed = false;
    let channel: ReturnType<typeof client.channel> | undefined;
    async function setup() {
      try {
        if (staff) {
          const session = await api<{ accessToken: string }>("/api/auth");
          if (disposed) return;
          await client!.realtime.setAuth(session.accessToken);
        }
        if (disposed) return;
        channel = staff
          ? client!
              .channel(`kitchen:${createClientId()}`)
              .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "orders" },
                () => void refresh(),
              )
          : client!
              .channel(`order:${orderToken}`)
              .on("broadcast", { event: "changed" }, () => void refresh());
        channel.subscribe((status) => {
          if (disposed) return;
          setRealtime(status === "SUBSCRIBED");
          if (status === "SUBSCRIBED") void refresh();
        });
      } catch {
        setRealtime(false);
      }
    }
    void setup();
    const renew = staff
      ? setInterval(async () => {
          try {
            const session = await api<{ accessToken: string }>("/api/auth");
            if (!disposed) await client.realtime.setAuth(session.accessToken);
          } catch {
            if (!disposed) setRealtime(false);
          }
        }, 30 * 60000)
      : undefined;
    return () => {
      disposed = true;
      if (renew) clearInterval(renew);
      if (channel) void client.removeChannel(channel);
    };
  }, [orderToken, staff, refresh]);
  return { data, setData, connected, error, realtime, refresh };
}
