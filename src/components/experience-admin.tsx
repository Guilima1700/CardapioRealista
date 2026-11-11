"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Users,
  Star,
  TrendingUp,
  AlertTriangle,
  Check,
  ArrowUpRight,
  Settings2,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { api } from "@/lib/client";
import { createClientId } from "@/lib/client-id";
import { money, type Catalog } from "@/lib/types";
import {
  groupLabels,
  issueLabels,
  reviewIssues,
  type ExperienceSettings,
} from "@/lib/experiences";
import type { CommerceReport, Recommendation } from "@/lib/intelligence";
import type { reviewsReport } from "@/lib/server/commerce";
import { Modal, Spinner, Empty } from "./ui";
type Reviews = Awaited<ReturnType<typeof reviewsReport>>;
const complaintLabels = {
  new: "Nova",
  analysis: "Em análise",
  handling: "Em atendimento",
  resolved: "Resolvida",
};
function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: React.ReactNode;
  note?: string;
}) {
  return (
    <article className="brasa-insight-metric">
      <small>{label}</small>
      <strong>{value}</strong>
      {note && <p>{note}</p>}
    </article>
  );
}
function PeriodControls({
  period,
  setPeriod,
  from,
  setFrom,
  to,
  setTo,
  source,
  setSource,
}: {
  period: string;
  setPeriod: (v: string) => void;
  from: string;
  setFrom: (v: string) => void;
  to: string;
  setTo: (v: string) => void;
  source: string;
  setSource: (v: string) => void;
}) {
  return (
    <div className="brasa-insight-filters">
      <label>
        Período
        <select value={period} onChange={(e) => setPeriod(e.target.value)}>
          {[
            ["today", "Hoje"],
            ["7", "Últimos 7 dias"],
            ["30", "Últimos 30 dias"],
            ["month", "Mês atual"],
            ["previous", "Mês anterior"],
            ["custom", "Personalizado"],
          ].map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      {period === "custom" && (
        <>
          <label>
            De
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            Até
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </>
      )}
      <label>
        Fonte de dados
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="production">Operação real</option>
          <option value="demo">Demonstração · registros de teste</option>
        </select>
      </label>
    </div>
  );
}
function usePeriod() {
  const [period, setPeriod] = useState("30"),
    [from, setFrom] = useState(new Date().toISOString().slice(0, 10)),
    [to, setTo] = useState(new Date().toISOString().slice(0, 10)),
    [source, setSource] = useState("production");
  return { period, setPeriod, from, setFrom, to, setTo, source, setSource };
}
function query(p: ReturnType<typeof usePeriod>) {
  return new URLSearchParams({
    period: p.period,
    from: p.from,
    to: p.to,
    source: p.source,
  });
}
export function ExperienceSettingsPanel() {
  const [config, setConfig] = useState<ExperienceSettings | null>(null),
    [pin, setPin] = useState(""),
    [pinConfigured, setPinConfigured] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    void api<{ config: ExperienceSettings; pinConfigured: boolean }>(
      "/api/experience/settings",
    )
      .then((r) => {
        setConfig(r.config);
        setPinConfigured(r.pinConfigured);
      })
      .catch((e) => setMessage(e.message));
  }, []);
  if (!config) return <div className="panel">{message || <Spinner />}</div>;
  const set = <K extends keyof ExperienceSettings>(
    k: K,
    v: ExperienceSettings[K],
  ) => setConfig((c) => (c ? { ...c, [k]: v } : c));
  return (
    <form
      className="panel brasa-experience-settings"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage("");
        try {
          const saved = await api<ExperienceSettings>(
            "/api/experience/settings",
            {
              method: "POST",
              body: JSON.stringify({ config, pin: pin || undefined }),
            },
          );
          setConfig(saved);
          setPin("");
          setPinConfigured(pinConfigured || !!pin);
          setMessage("Configurações salvas.");
        } catch (e) {
          setMessage((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="panel-heading">
        <div>
          <span className="eyebrow">EXPERIÊNCIA DA MESA</span>
          <h2>Pedidos juntos. Atendimento atento.</h2>
        </div>
        <Settings2 />
      </div>
      <div className="form-grid">
        <label className="check-label">
          <input
            type="checkbox"
            checked={config.collectiveEnabled}
            onChange={(e) => set("collectiveEnabled", e.target.checked)}
          />
          Habilitar pedido coletivo
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={config.allowNewRounds}
            onChange={(e) => set("allowNewRounds", e.target.checked)}
          />
          Permitir novas rodadas
        </label>
        <label>
          Validade da sessão em minutos
          <input
            type="number"
            min={15}
            max={720}
            value={config.sessionMinutes}
            onChange={(e) => set("sessionMinutes", Number(e.target.value))}
          />
        </label>
        <label>
          Entrada na mesa
          <select
            value={config.entryMode}
            onChange={(e) =>
              set(
                "entryMode",
                e.target.value as ExperienceSettings["entryMode"],
              )
            }
          >
            <option value="open">Livre, com apelido</option>
            <option value="pin">Senha de acesso</option>
            <option value="approval">Aprovação de funcionário</option>
          </select>
        </label>
        {config.entryMode === "pin" && (
          <label>
            {pinConfigured
              ? "Substituir senha (deixe vazio para manter)"
              : "Defina a senha"}
            <input
              type="password"
              minLength={4}
              maxLength={100}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              autoComplete="new-password"
              required={!pinConfigured}
            />
          </label>
        )}
        <label className="check-label">
          <input
            type="checkbox"
            checked={config.reviewEnabled}
            onChange={(e) => set("reviewEnabled", e.target.checked)}
          />
          Solicitar avaliação interna
        </label>
        <label>
          Minutos após a entrega
          <input
            type="number"
            min={0}
            max={1440}
            value={config.reviewDelayMinutes}
            onChange={(e) => set("reviewDelayMinutes", Number(e.target.value))}
          />
        </label>
        <label>
          Link público para avaliar no Google
          <input
            type="url"
            placeholder="https://..."
            value={config.googleReviewUrl}
            onChange={(e) => set("googleReviewUrl", e.target.value)}
          />
        </label>
        <label>
          Alertar notas até
          <select
            value={config.lowRating}
            onChange={(e) => set("lowRating", Number(e.target.value))}
          >
            {[1, 2, 3].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label>
          Classificar novos dados como
          <select
            value={config.dataMode}
            onChange={(e) =>
              set("dataMode", e.target.value as ExperienceSettings["dataMode"])
            }
          >
            <option value="production">Operação real</option>
            <option value="demo">Demonstração</option>
          </select>
        </label>
        <label>
          Mínimo de visitantes por produto
          <input
            type="number"
            min={30}
            max={10000}
            value={config.minRecommendationViews}
            onChange={(e) =>
              set("minRecommendationViews", Number(e.target.value))
            }
          />
        </label>
        <label>
          Mínimo de pedidos para recomendações
          <input
            type="number"
            min={10}
            max={10000}
            value={config.minRecommendationOrders}
            onChange={(e) =>
              set("minRecommendationOrders", Number(e.target.value))
            }
          />
        </label>
        <label>
          Mínimo de dias observados
          <input
            type="number"
            min={7}
            max={90}
            value={config.minAnalysisDays}
            onChange={(e) => set("minAnalysisDays", Number(e.target.value))}
          />
        </label>
      </div>
      <p className="notice">
        NFC e QR Code abrem o mesmo endereço HTTPS da mesa. Uma tag estática não
        comprova a presença física do cliente. A senha ou aprovação é opcional.
      </p>
      <p className="fine-print">
        O convite ao Google aparece igualmente para todos, independentemente da
        avaliação interna. O modo demonstração só classifica novos registros;
        não altera o histórico.
      </p>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <button className="button primary" disabled={busy}>
        {busy ? <Spinner /> : <Check size={16} />}Salvar configurações
      </button>
    </form>
  );
}
type StaffGroup = {
  id: string;
  tableId: string;
  status: keyof typeof groupLabels;
  expiresAt: string;
  participants: {
    id: string;
    name: string;
    approved: boolean;
    denied?: boolean;
  }[];
};
export function CollectivePanel({ compact = false }: { compact?: boolean }) {
  const [groups, setGroups] = useState<StaffGroup[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setGroups(await api<StaffGroup[]>("/api/experience/groups"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);
  const active = groups.filter((g) => Date.parse(g.expiresAt) > Date.now()),
    pending = active.filter((g) =>
      g.participants.some((p) => !p.approved && !p.denied),
    );
  async function approve(g: StaffGroup, id: string, approved: boolean) {
    setBusy(true);
    try {
      await api("/api/experience/groups", {
        method: "POST",
        body: JSON.stringify({ sessionId: g.id, participantId: id, approved }),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function close(g: StaffGroup) {
    if (
      !window.confirm(
        "Encerrar esta sessão coletiva? Pedidos já enviados serão preservados.",
      )
    )
      return;
    setBusy(true);
    try {
      await api("/api/experience/groups", {
        method: "POST",
        body: JSON.stringify({ action: "close", sessionId: g.id }),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (compact && !pending.length && !error) return null;
  return (
    <section className="panel brasa-collective-staff">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">ATENDIMENTO</span>
          <h2>
            {compact ? "Entradas aguardando aprovação" : "Sessões coletivas"}
          </h2>
        </div>
        <Users />
      </div>
      {error && <p className="notice error">{error}</p>}
      {!active.length && (
        <Empty
          icon={Users}
          title="Nenhuma mesa em sessão"
          text="Os pedidos coletivos aparecerão aqui quando iniciados."
        />
      )}
      {(compact ? pending : active).map((g) => (
        <article className="brasa-staff-group" key={g.id}>
          <div>
            <b>{g.tableId.replace("table-", "Mesa ")}</b>
            {!compact && (
              <button
                className="button ghost"
                disabled={busy}
                onClick={() => void close(g)}
              >
                Encerrar sessão
              </button>
            )}
            <small>{groupLabels[g.status]}</small>
          </div>
          <div className="brasa-group-members">
            {g.participants.map((p) => (
              <span key={p.id}>
                {p.name}
                {p.approved ? (
                  " · aprovado"
                ) : p.denied ? (
                  " · não aprovado"
                ) : (
                  <>
                    <button
                      disabled={busy}
                      className="button secondary"
                      onClick={() => void approve(g, p.id, true)}
                    >
                      Aprovar
                    </button>
                    <button
                      disabled={busy}
                      className="button ghost"
                      onClick={() => void approve(g, p.id, false)}
                    >
                      Recusar
                    </button>
                  </>
                )}
              </span>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}
export function ReviewsPanel() {
  const p = usePeriod(),
    [data, setData] = useState<Reviews | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [rating, setRating] = useState(""),
    [issue, setIssue] = useState(""),
    [product, setProduct] = useState(""),
    [table, setTable] = useState(""),
    [status, setStatus] = useState("");
  const url =
    "/api/experience/reviews?" +
    query(p) +
    "&" +
    new URLSearchParams({ rating, issue, product, table, status });
  const load = useCallback(async () => {
    try {
      setData(await api<Reviews>(url));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [url]);
  useEffect(() => {
    void load();
  }, [load]);
  async function change(id: string, status: string, version: number) {
    setBusy(true);
    try {
      await api("/api/experience/reviews", {
        method: "POST",
        body: JSON.stringify({ id, status, version }),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="brasa-insights">
      <PeriodControls {...p} />
      <div className="brasa-insight-filters">
        <label>
          Nota mínima em alguma dimensão
          <select value={rating} onChange={(e) => setRating(e.target.value)}>
            <option value="">Todas</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                Até {n} estrelas
              </option>
            ))}
          </select>
        </label>
        <label>
          Problema
          <select value={issue} onChange={(e) => setIssue(e.target.value)}>
            <option value="">Todos</option>
            {reviewIssues.map((i) => (
              <option key={i} value={i}>
                {issueLabels[i]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Produto
          <select value={product} onChange={(e) => setProduct(e.target.value)}>
            <option value="">Todos</option>
            {data?.products.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Mesa
          <select value={table} onChange={(e) => setTable(e.target.value)}>
            <option value="">Todas</option>
            {data?.tables.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tratamento
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(complaintLabels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      {p.source === "demo" && (
        <p className="notice">
          DEMONSTRAÇÃO · apenas avaliações de pedidos classificados como teste.
        </p>
      )}
      {error && (
        <p role="alert" className="notice error">
          {error}
          <button className="text-link" onClick={() => void load()}>
            Tentar novamente
          </button>
        </p>
      )}
      {!data && !error && <Spinner />}
      {data && (
        <>
          <div className="brasa-insight-metrics">
            <Metric label="Avaliações" value={data.count} />
            {[
              ["Geral", data.overall],
              ["Comida", data.food],
              ["Atendimento", data.service],
              ["Tempo de espera", data.wait],
            ].map(([label, value]) => (
              <Metric
                key={label}
                label={String(label)}
                value={data.count ? `${Number(value).toFixed(1)} / 5` : "—"}
              />
            ))}
          </div>
          <section className="panel">
            <h3>O que merece atenção</h3>
            {data.alerts.length ? (
              data.alerts.map((a) => (
                <p className="notice" key={a.key}>
                  <AlertTriangle size={17} />
                  {a.key.startsWith("recurring-")
                    ? `Nos últimos 7 dias, ${a.count} clientes relataram ${issueLabels[a.key.replace("recurring-", "") as keyof typeof issueLabels]}. Amostra: ${data.recentSample} avaliações.`
                    : a.message}
                  {a.reviewId && (
                    <a href={"#review-" + a.reviewId}>Ver avaliação</a>
                  )}
                </p>
              ))
            ) : (
              <p className="muted">
                Nenhum alerta neste filtro. Recorrências exigem pelo menos 10
                avaliações e 3 relatos do mesmo problema.
              </p>
            )}
          </section>
          <section className="panel">
            <h3>Evolução das avaliações</h3>
            <div className="brasa-review-evolution">
              {[...new Set(data.reviews.map((r) => r.createdAt.slice(0, 10)))]
                .sort()
                .map((date) => {
                  const rows = data.reviews.filter((r) =>
                      r.createdAt.startsWith(date),
                    ),
                    avg =
                      rows.reduce(
                        (s, r) => s + (r.food + r.service + r.wait) / 3,
                        0,
                      ) / rows.length;
                  return (
                    <div key={date}>
                      <time>{date}</time>
                      <meter min={0} max={5} value={avg} />
                      <b>{avg.toFixed(1)}</b>
                      <small>{rows.length} avaliações</small>
                    </div>
                  );
                })}
            </div>
            {!data.count && (
              <Empty
                icon={Star}
                title="A experiência começa com escuta"
                text="As avaliações entregues pelos clientes aparecerão aqui."
              />
            )}
          </section>
          {data.reviews.map((r) => (
            <article
              className="panel brasa-admin-review"
              id={"review-" + r.id}
              key={r.id}
            >
              <header>
                <div>
                  <span className="eyebrow">
                    {r.order?.tableName} · PEDIDO #{r.order?.number}
                  </span>
                  <h3>
                    {((r.food + r.service + r.wait) / 3).toFixed(1)}{" "}
                    <Star size={17} />
                  </h3>
                  <time>{new Date(r.createdAt).toLocaleString("pt-BR")}</time>
                </div>
                <label>
                  Tratamento
                  <select
                    disabled={busy}
                    value={r.status}
                    onChange={(e) =>
                      void change(r.id, e.target.value, r.version)
                    }
                  >
                    {Object.entries(complaintLabels).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
              </header>
              <p>
                Comida {r.food}/5 · Atendimento {r.service}/5 · Espera {r.wait}
                /5
              </p>
              {r.issues.length > 0 && (
                <div className="brasa-issue-tags">
                  {r.issues.map((i) => (
                    <span key={i}>{issueLabels[i]}</span>
                  ))}
                </div>
              )}
              {r.hasProblem && !r.issues.length && (
                <p className="notice">
                  Cliente informou um problema específico.
                </p>
              )}
              {r.comment && <blockquote>{r.comment}</blockquote>}
              {r.suggestion && (
                <p>
                  <b>Sugestão:</b> {r.suggestion}
                </p>
              )}
              <details>
                <summary>Produtos e atendimento associados</summary>
                {r.order?.items.map((i, k) => (
                  <p key={k}>
                    {i.quantity}× {i.name}
                    {i.participantName ? " · " + i.participantName : ""}
                  </p>
                ))}
                {r.order?.history.map((h) => (
                  <small key={h.status}>
                    {h.status} · {new Date(h.at).toLocaleString("pt-BR")}
                    <br />
                  </small>
                ))}
              </details>
            </article>
          ))}
          {!data.complete && (
            <p className="notice">
              Período excedeu o limite de consulta. Reduza o período para uma
              análise completa.
            </p>
          )}
        </>
      )}
    </div>
  );
}
export function CommercePanel({
  catalog,
  onMenuChange,
}: {
  catalog: Catalog;
  onMenuChange: () => void;
}) {
  const p = usePeriod(),
    [example, setExample] = useState(false),
    [data, setData] = useState<CommerceReport | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<Recommendation | null>(null),
    [text, setText] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const url =
      "/api/experience/commerce?" +
      query(p) +
      "&example=" +
      (example ? "1" : "0"),
    load = useCallback(async () => {
      try {
        setData(await api<CommerceReport>(url));
        setError("");
      } catch (e) {
        setError((e as Error).message);
      }
    }, [url]);
  useEffect(() => {
    void load();
  }, [load]);
  async function action(
    r: Recommendation,
    action: "apply" | "ignore" | "resolve" | "disable",
  ) {
    setBusy(true);
    try {
      await api("/api/experience/commerce", {
        method: "POST",
        body: JSON.stringify({
          id: r.id,
          version: r.version,
          mutationId: createClientId(),
          action,
          confirmed,
          text,
        }),
      });
      setSelected(null);
      await load();
      if (action === "apply") onMenuChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const percent = (v: number | null) =>
    v === null ? "—" : (v * 100).toFixed(1) + "%";
  return (
    <div className="brasa-insights">
      <PeriodControls {...p} />
      <button className="button secondary" onClick={() => setExample(!example)}>
        {example
          ? "Voltar aos dados do restaurante"
          : "Ver exemplo ilustrativo separado"}
      </button>
      {data?.example && (
        <p className="notice">
          EXEMPLO ILUSTRATIVO · números sintéticos, sem relação com este
          restaurante. Nenhuma ação pode ser aplicada.
        </p>
      )}
      {p.source === "demo" && (
        <p className="notice">
          DEMONSTRAÇÃO · estes registros são exclusivamente da operação de teste
          e ficam separados dos dados reais.
        </p>
      )}
      {error && (
        <p role="alert" className="notice error">
          {error}
          <button className="text-link" onClick={() => void load()}>
            Tentar novamente
          </button>
        </p>
      )}
      {!data && !error && <Spinner />}
      {data && (
        <>
          <div className="brasa-insight-metrics">
            <Metric
              label="Valor de pedidos entregues"
              value={money(data.revenue)}
              note={`Período anterior: ${money(data.previousRevenue)}. Não representa caixa recebido.`}
            />
            <Metric
              label="Pedidos"
              value={data.orderCount}
              note={`${data.deliveredCount} entregues · ${data.trackedOrders} vinculados à navegação`}
            />
            <Metric
              label="Ticket de pedidos entregues"
              value={money(data.ticket)}
            />
            <Metric
              label="Abandono observado do carrinho"
              value={percent(data.abandonment)}
              note="Sessões com adição e sem pedido vinculado no período."
            />
            <Metric
              label="3D → adição ao carrinho"
              value={percent(data.modelConversion)}
              note={`${data.modelSample} sessões com abertura 3D`}
            />
            <Metric
              label="AR → adição ao carrinho"
              value={percent(data.arConversion)}
              note={`${data.arSample} sessões com solicitação de AR`}
            />
          </div>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">DESEMPENHO NO TEMPO</span>
                <h3>Pedidos entregues</h3>
              </div>
              <TrendingUp />
            </div>
            <div style={{ height: 240, width: "100%", minWidth: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.daily}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => money(v)} />
                  <Tooltip formatter={(v) => money(Number(v))} />
                  <Area
                    dataKey="previous"
                    name="Período anterior"
                    stroke="#aaa08b"
                    fill="#aaa08b"
                    fillOpacity={0.08}
                  />
                  <Area
                    dataKey="value"
                    name="Período atual"
                    stroke="#b84a2b"
                    fill="#b84a2b"
                    fillOpacity={0.12}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>
          <div className="brasa-insight-columns">
            <section className="panel">
              <span className="eyebrow">JORNADA OBSERVADA</span>
              <h3>Do cardápio ao pedido</h3>
              <div className="brasa-funnel">
                {data.funnel.map((f) => (
                  <div key={f.type}>
                    <span>
                      {f.label}
                      <b>{f.count}</b>
                    </span>
                    <i
                      style={{
                        width: `${Math.max(1, (100 * f.count) / Math.max(1, ...data.funnel.map((x) => x.count)))}%`,
                      }}
                    />
                    <small>
                      {f.fromPrevious === null
                        ? "Sessões únicas"
                        : `${percent(f.fromPrevious)} das sessões da etapa anterior`}
                    </small>
                  </div>
                ))}
              </div>
              <p className="fine-print">
                3D e AR são caminhos opcionais. “Solicitaram AR” registra a
                ativação solicitada; o visualizador nativo não informa se o
                prato foi posicionado. Associações não demonstram causalidade.
              </p>
            </section>
            <section className="panel">
              <span className="eyebrow">OPORTUNIDADES COM EVIDÊNCIA</span>
              <h3>Próximas boas decisões</h3>
              {!data.sufficient && (
                <p className="notice">
                  Dados insuficientes para gerar recomendações confiáveis. Há{" "}
                  {data.orderCount} pedidos e {Math.floor(data.observedDays)}{" "}
                  dias observados. O mínimo é configurado em Experiência.
                </p>
              )}
              {data.sufficient && !data.recommendations.length && (
                <p className="muted">
                  A amostra já permite análise, mas nenhuma regra encontrou uma
                  oportunidade relevante neste período.
                </p>
              )}
              {data.recommendations.map((r) => (
                <article
                  className="brasa-recommendation"
                  key={r.id || r.fingerprint}
                >
                  <span className="eyebrow">
                    {data.example
                      ? "EXEMPLO"
                      : r.status === "new"
                        ? "NOVA SUGESTÃO"
                        : r.status === "applied"
                          ? "APLICADA"
                          : r.status === "ignored"
                            ? "IGNORADA"
                            : "RESOLVIDA"}
                    {r.publicEnabled ? " · ATIVA NO CARDÁPIO" : ""}
                  </span>
                  <h4>{r.title}</h4>
                  <p>{r.message}</p>
                  <small>{r.evidence}</small>
                  <button
                    className="text-link"
                    onClick={() => {
                      setSelected(r);
                      setText(
                        r.action === "description"
                          ? catalog.products.find((p) => p.id === r.productId)
                              ?.description || ""
                          : r.campaignText || "",
                      );
                      setConfirmed(false);
                    }}
                  >
                    Visualizar detalhes <ArrowUpRight size={14} />
                  </button>
                </article>
              ))}
            </section>
          </div>
          <section className="panel">
            <h3>Produtos · atenção, conversão e margem</h3>
            <p className="fine-print">
              Conversão = sessões que visualizaram e adicionaram o mesmo
              produto. Custos ausentes não geram margem. Valores de venda são
              dos pedidos; a margem base usa os custos e o preço atuais.
            </p>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Visitantes</th>
                    <th>Adições</th>
                    <th>Conversão</th>
                    <th>3D → adição</th>
                    <th>AR → adição</th>
                    <th>Unidades</th>
                    <th>Valor pedido</th>
                    <th>Margem base estimada</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.products]
                    .sort((a, b) => b.quantity - a.quantity)
                    .map((r) => (
                      <tr key={r.id}>
                        <td>{r.name}</td>
                        <td>{r.views}</td>
                        <td>{r.adds}</td>
                        <td>{percent(r.conversion)}</td>
                        <td>
                          {r.modelAdds}/{r.modelViews} ·{" "}
                          {percent(
                            r.modelViews ? r.modelAdds / r.modelViews : null,
                          )}
                        </td>
                        <td>
                          {r.arAdds}/{r.arViews} ·{" "}
                          {percent(r.arViews ? r.arAdds / r.arViews : null)}
                        </td>
                        <td>{r.quantity}</td>
                        <td>{money(r.value)}</td>
                        <td>
                          {r.estimatedMargin === null
                            ? "Custos não cadastrados"
                            : money(r.estimatedMargin)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
          <div className="brasa-insight-columns">
            <section className="panel">
              <h3>Categorias mais acessadas</h3>
              {[...data.categories]
                .sort((a, b) => b.visits - a.visits)
                .map((c) => (
                  <p className="brasa-stat-row" key={c.id}>
                    <span>{c.name}</span>
                    <b>{c.visits}</b>
                  </p>
                ))}
            </section>
            <section className="panel">
              <h3>Adicionais mais pedidos</h3>
              {[...data.modifiers]
                .sort((a, b) => b.quantity - a.quantity)
                .map((c) => (
                  <p className="brasa-stat-row" key={c.productId + c.id}>
                    <span>
                      {c.name} ·{" "}
                      {catalog.products.find((p) => p.id === c.productId)?.name}
                    </span>
                    <b>{c.quantity}</b>
                  </p>
                ))}
              {!data.modifiers.length && (
                <p className="muted">Nenhum adicional no período.</p>
              )}
            </section>
            <section className="panel">
              <h3>Combinações frequentes</h3>
              {data.pairs.slice(0, 10).map((c) => (
                <p className="brasa-stat-row" key={c.a + c.b}>
                  <span>
                    {catalog.products.find((p) => p.id === c.a)?.name} +{" "}
                    {catalog.products.find((p) => p.id === c.b)?.name}
                  </span>
                  <b>{c.count} pedidos</b>
                </p>
              ))}
              {!data.pairs.length && (
                <p className="muted">Nenhuma combinação registrada.</p>
              )}
            </section>
            <section className="panel">
              <h3>Movimento por horário</h3>
              <div className="brasa-hour-chart">
                {data.hourly.map((h) => (
                  <div key={h.hour} title={`${h.hour}h: ${h.orders} pedidos`}>
                    <i
                      style={{
                        height:
                          Math.max(
                            1,
                            (h.orders /
                              Math.max(
                                1,
                                ...data.hourly.map((v) => v.orders),
                              )) *
                              100,
                          ) + "%",
                      }}
                    />
                    <small>{h.hour}</small>
                    <span className="sr-only">{h.orders} pedidos</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <section className="panel">
            <h3>Histórico de decisões</h3>
            {data.actions?.length ? (
              data.actions.map((a, i) => (
                <p className="brasa-stat-row" key={i}>
                  <span>
                    {{
                      apply: "Aplicada",
                      ignore: "Ignorada",
                      resolve: "Resolvida",
                      disable: "Desativada no cardápio",
                    }[a.action] || a.action}{" "}
                    ·{" "}
                    {data.recommendations.find(
                      (r) => r.id === a.recommendation_id,
                    )?.title || a.recommendation_id}
                  </span>
                  <small>
                    {new Date(a.created_at).toLocaleString("pt-BR")} ·
                    funcionário {a.actor.slice(0, 8)}
                  </small>
                </p>
              ))
            ) : (
              <p className="muted">Nenhuma ação registrada.</p>
            )}
          </section>
          {(data.legacyOrders > 0 || !data.complete) && (
            <p className="notice">
              {data.legacyOrders > 0
                ? `${data.legacyOrders} pedidos anteriores à classificação de origem ficaram fora das métricas. `
                : ""}
              {!data.complete
                ? "Consulta incompleta: reduza o período. Recomendações novas estão desativadas."
                : ""}
            </p>
          )}
        </>
      )}
      {selected && (
        <Modal
          label="Detalhes da recomendação"
          onClose={() => {
            if (!busy) setSelected(null);
          }}
        >
          <div className="brasa-recommendation-details">
            <span className="eyebrow">DECISÃO DO ADMINISTRADOR</span>
            <h2>{selected.title}</h2>
            <p>{selected.message}</p>
            <p className="notice">{selected.evidence}</p>
            <p className="fine-print">
              Período: {selected.start.slice(0, 10)} a{" "}
              {selected.end.slice(0, 10)} · fonte{" "}
              {selected.source === "demo" ? "demonstração" : "operação real"}
            </p>
            {!data?.example &&
              ["new", "applied"].includes(selected.status || "new") && (
                <>
                  {["description", "campaign"].includes(selected.action) && (
                    <label className="brasa-social-field">
                      {selected.action === "description"
                        ? "Nova descrição do produto"
                        : "Mensagem da campanha no cardápio"}
                      <textarea
                        maxLength={selected.action === "campaign" ? 240 : 1000}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                      />
                    </label>
                  )}
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    Confirmo a alteração:{" "}
                    {selected.action === "feature"
                      ? "destacar o produto"
                      : selected.action === "modifier"
                        ? "sinalizar o adicional como destaque"
                        : selected.action === "pair"
                          ? "publicar a sugestão de acompanhamento com preços atuais"
                          : selected.action === "description"
                            ? "substituir a descrição"
                            : "publicar a mensagem de campanha"}
                    . Nenhum preço será alterado.
                  </label>
                  <button
                    className="button primary"
                    disabled={busy || !confirmed}
                    onClick={() => void action(selected, "apply")}
                  >
                    {busy ? <Spinner /> : "Aplicar recomendação"}
                  </button>
                </>
              )}
            <div className="brasa-social-inline">
              {selected.status === "new" && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void action(selected, "ignore")}
                >
                  Ignorar
                </button>
              )}
              {!data?.example && selected.status !== "resolved" && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void action(selected, "resolve")}
                >
                  Marcar como resolvida
                </button>
              )}
              {selected.publicEnabled && (
                <button
                  className="button ghost"
                  disabled={busy}
                  onClick={() => void action(selected, "disable")}
                >
                  Desativar sugestão no cardápio
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
