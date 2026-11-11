"use client";
import { CollectivePanel } from "./experience-admin";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bell,
  BellOff,
  ChefHat,
  Clock,
  ArrowRight,
  MapPin,
  RefreshCw,
  LogOut,
  LayoutDashboard,
  Expand,
  AlertTriangle,
  WifiOff,
} from "lucide-react";
import { api } from "@/lib/client";
import { useLive } from "@/lib/use-live";
import { statuses, statusLabels, type Order, money } from "@/lib/types";
import { Brand, Spinner } from "./ui";
import { useHydrated } from "@/lib/use-hydrated";
export default function Kitchen({
  initial,
  name,
  role,
  backend,
  timezone,
  initialNow,
}: {
  initial: Order[];
  name: string;
  role: string;
  backend: string;
  timezone: string;
  initialNow: number;
}) {
  const hydrated = useHydrated();
  const {
    data: orders,
    connected,
    realtime,
    error,
    refresh,
  } = useLive<Order[]>("/api/orders", { initial, staff: true });
  const [now, setNow] = useState(initialNow),
    [sound, setSound] = useState(false),
    [delivered, setDelivered] = useState(false),
    [filter, setFilter] = useState(""),
    [pending, setPending] = useState<string | null>(null),
    [notice, setNotice] = useState("");
  const known = useRef(new Set(initial.map((o) => o.id))),
    audio = useRef<AudioContext | null>(null);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const added = orders.some((o) => !known.current.has(o.id));
    known.current = new Set(orders.map((o) => o.id));
    if (added && sound && audio.current) {
      const oscillator = audio.current.createOscillator(),
        gain = audio.current.createGain();
      oscillator.connect(gain);
      gain.connect(audio.current.destination);
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.08, audio.current.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        audio.current.currentTime + 0.6,
      );
      oscillator.start();
      oscillator.stop(audio.current.currentTime + 0.6);
    }
  }, [orders, sound]);
  async function toggleSound() {
    try {
      if (!audio.current) audio.current = new AudioContext();
      await audio.current.resume();
      setSound(!sound);
    } catch {
      setNotice("O navegador não permitiu ativar o som.");
    }
  }
  async function advance(order: Order) {
    const next = statuses[statuses.indexOf(order.status) + 1];
    if (!next) return;
    setPending(order.id);
    setNotice("");
    try {
      await api(`/api/kitchen/${order.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: next, version: order.version }),
      });
      await refresh();
    } catch (e) {
      setNotice((e as Error).message);
      await refresh();
    } finally {
      setPending(null);
    }
  }
  const active = orders.filter((o) => o.status !== "delivered"),
    visible = filter
      ? orders.filter(
          (o) =>
            o.tableName.toLowerCase().includes(filter.toLowerCase()) ||
            String(o.number).includes(filter),
        )
      : orders;
  return (
    <div className="kitchen-app">
      <header className="kitchen-header">
        <div>
          <Brand name={name} small />
          <span className="header-separator" />
          <div>
            <span className="eyebrow">OPERAÇÃO</span>
            <h1>Painel da cozinha</h1>
          </div>
        </div>
        <div className="kitchen-actions">
          <span className={`live-indicator ${connected ? "" : "offline"}`}>
            <i />
            {!connected
              ? "Reconectando"
              : realtime
                ? "Tempo real ativo"
                : backend === "sqlite"
                  ? "Atualiza a cada 2,5 s"
                  : "Recuperação por consulta"}
          </span>
          <button
            disabled={!hydrated}
            className={`button ${sound ? "secondary" : "ghost"}`}
            onClick={toggleSound}
          >
            {sound ? <Bell size={17} /> : <BellOff size={17} />}
            <span>Som {sound ? "ativado" : "desativado"}</span>
          </button>
          <button
            disabled={!hydrated}
            className="icon-button"
            title="Tela cheia"
            aria-label="Tela cheia"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else
                void document.documentElement
                  .requestFullscreen()
                  .catch(() => setNotice("Tela cheia indisponível."));
            }}
          >
            <Expand size={19} />
          </button>
          {role === "admin" && (
            <Link
              className="icon-button"
              href="/admin"
              aria-label="Abrir gestão"
            >
              <LayoutDashboard size={19} />
            </Link>
          )}
          <button
            disabled={!hydrated}
            className="icon-button"
            aria-label="Sair"
            onClick={async () => {
              await api("/api/auth", { method: "DELETE" });
              window.location.assign("/equipe");
            }}
          >
            <LogOut size={19} />
          </button>
        </div>
      </header>
      <main className="kitchen-main">
        <a className="back-link" href="/atendimento">
          Atendimento e avaliações →
        </a>
        <CollectivePanel compact />
        <div className="kitchen-summary">
          <div>
            <span className="eyebrow">CADA PEDIDO, NO PONTO CERTO</span>
            <h2>
              Vamos fazer acontecer<span>.</span>
            </h2>
            <p>
              {active.length} pedido{active.length !== 1 ? "s" : ""} em
              andamento ·{" "}
              {new Date(now).toLocaleDateString("pt-BR", {
                timeZone: timezone,
                day: "numeric",
                month: "long",
              })}
            </p>
          </div>
          <div className="kitchen-controls">
            <input
              disabled={!hydrated}
              aria-label="Buscar pedido ou mesa"
              placeholder="Buscar mesa ou pedido…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <button
              disabled={!hydrated}
              className="button secondary"
              onClick={() => void refresh()}
            >
              <RefreshCw size={15} /> Atualizar
            </button>
            <label>
              <input
                disabled={!hydrated}
                type="checkbox"
                checked={delivered}
                onChange={(e) => setDelivered(e.target.checked)}
              />{" "}
              Ver entregues
            </label>
          </div>
        </div>
        {(notice || !connected) && (
          <p className="notice error" role="alert">
            {!connected ? (
              <>
                <WifiOff size={17} />
                {error} Tentando recuperar a conexão…
              </>
            ) : (
              notice
            )}
          </p>
        )}
        <div className={`kitchen-board ${delivered ? "with-delivered" : ""}`}>
          {statuses
            .filter((s) => s !== "delivered" || delivered)
            .map((status) => {
              const list = visible
                .filter((o) => o.status === status)
                .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
              return (
                <section
                  className={`kitchen-column status-${status}`}
                  key={status}
                >
                  <header>
                    <i />
                    <h3>{statusLabels[status]}</h3>
                    <span>{list.length}</span>
                  </header>
                  <div className="kitchen-column-body">
                    {list.length === 0 ? (
                      <div className="column-empty">
                        <ChefHat size={26} />
                        <p>Tudo em dia por aqui</p>
                      </div>
                    ) : (
                      list.map((order) => {
                        const minutes = Math.max(
                          0,
                          Math.floor(
                            (now - new Date(order.createdAt).getTime()) / 60000,
                          ),
                        );
                        const late =
                          minutes >= 25 &&
                          order.status !== "delivered" &&
                          order.status !== "ready";
                        return (
                          <article
                            className={`kitchen-order ${late ? "late" : ""}`}
                            key={order.id}
                          >
                            <div className="kitchen-order-top">
                              <strong>
                                #{String(order.number).padStart(4, "0")}
                              </strong>
                              <span>
                                <MapPin size={13} />
                                {order.tableName}
                              </span>
                            </div>
                            <div className="order-timing">
                              <span>
                                <Clock size={13} />
                                {new Date(order.createdAt).toLocaleTimeString(
                                  "pt-BR",
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    timeZone: timezone,
                                  },
                                )}
                              </span>
                              <b>
                                {late && <AlertTriangle size={12} />} {minutes}{" "}
                                min
                              </b>
                            </div>
                            <div className="kitchen-items">
                              {order.items.map((item, i) => (
                                <div className="kitchen-item" key={i}>
                                  <span>{item.quantity}×</span>
                                  <div>
                                    <h4>{item.name}</h4>
                                    {item.participantName && (
                                      <b className="participant-label">
                                        {item.participantName}
                                      </b>
                                    )}
                                    {item.modifiers.length > 0 && (
                                      <p>
                                        {item.modifiers
                                          .map((m) => m.name)
                                          .join(" · ")}
                                      </p>
                                    )}
                                    {item.notes && (
                                      <div className="kitchen-note">
                                        OBS: {item.notes}
                                      </div>
                                    )}
                                    {item.allergens.length > 0 && (
                                      <small>
                                        Alérgenos: {item.allergens.join(", ")}
                                      </small>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="kitchen-order-bottom">
                              <small>
                                {money(order.total)} ·{" "}
                                {order.payment === "cashier"
                                  ? "No caixa"
                                  : "Na mesa"}
                              </small>
                              {status !== "delivered" && (
                                <button
                                  className="button primary full"
                                  disabled={!hydrated || pending === order.id}
                                  onClick={() => void advance(order)}
                                >
                                  {pending === order.id ? (
                                    <Spinner />
                                  ) : (
                                    <>
                                      {status === "received"
                                        ? "Confirmar pedido"
                                        : status === "confirmed"
                                          ? "Começar preparo"
                                          : status === "preparing"
                                            ? "Marcar como pronto"
                                            : "Confirmar entrega"}{" "}
                                      <ArrowRight size={15} />
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          </article>
                        );
                      })
                    )}
                  </div>
                </section>
              );
            })}
        </div>
      </main>
    </div>
  );
}
