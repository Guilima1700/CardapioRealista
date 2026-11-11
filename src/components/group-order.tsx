"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  UserRound,
  Crown,
  Plus,
  Minus,
  Trash2,
  LockKeyhole,
  ArrowRight,
  Check,
  WifiOff,
} from "lucide-react";
import { api, browserSupabase, analyticsSessionId, track } from "@/lib/client";
import { createClientId } from "@/lib/client-id";
import { writeStored } from "@/lib/browser-storage";
import {
  defaultExperienceSettings,
  groupLabels,
  type GroupView,
  type GroupItem,
  type ExperienceSettings,
} from "@/lib/experiences";
import { money, type CartLine, type Table, type Order } from "@/lib/types";
import { Modal, Spinner } from "./ui";
type State = {
  view: GroupView | null;
  active?: boolean;
  config: ExperienceSettings;
};
type Context = {
  view: GroupView | null;
  busy: boolean;
  loaded: boolean;
  enabled: boolean;
  active: boolean;
  editing: GroupItem | null;
  setEditing: (item: GroupItem | null) => void;
  open: () => void;
  add: (line: CartLine) => Promise<void>;
};
const Collective = createContext<Context | undefined>(undefined);
export const useCollective = () => useContext(Collective);
export function GroupEntryBanner() {
  const g = useCollective();
  if (!g?.loaded || !g.enabled) return null;
  return (
    <section className="brasa-group-invite" aria-label="Pedido coletivo">
      <div className="brasa-social-icon">
        <Users size={22} />
      </div>
      <div>
        <b>
          {g.view
            ? "Seu pedido, em boa companhia."
            : g.active
              ? "Sua mesa já tem um pedido coletivo."
              : "Cada um escolhe. A mesa pede junto."}
        </b>
        <p>
          {g.view
            ? `${g.view.participants.length || 1} participantes · ${groupLabels[g.view.status]}`
            : "Entre com um apelido. Sem cadastro e sem aplicativo."}
        </p>
      </div>
      <button className="button secondary" onClick={g.open}>
        {g.view
          ? "Ver pedido coletivo"
          : g.active
            ? "Entrar no pedido"
            : "Iniciar pedido coletivo"}
        <ArrowRight size={16} />
      </button>
    </section>
  );
}
export function GroupOrderProvider({
  table,
  children,
  payments,
  accent,
}: {
  table: Table;
  children: ReactNode;
  payments: ("cashier" | "table")[];
  accent: string;
}) {
  const router = useRouter(),
    path = `/api/tables/${encodeURIComponent(table.id)}/group`;
  const [state, setState] = useState<State>({
      view: null,
      config: defaultExperienceSettings,
    }),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [opened, setOpened] = useState(false),
    [editing, setEditing] = useState<GroupItem | null>(null),
    [name, setName] = useState(""),
    [pin, setPin] = useState(""),
    [connected, setConnected] = useState(true),
    [realtime, setRealtime] = useState(false),
    [payment, setPayment] = useState<"cashier" | "table">(payments[0]);
  const flight = useRef(false),
    changeEpoch = useRef(0),
    retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const refresh = useCallback(async () => {
    if (flight.current) return;
    flight.current = true;
    const epoch = changeEpoch.current;
    try {
      const next = await api<State>(path);
      if (epoch === changeEpoch.current)
        setState((current) =>
          current.view &&
          next.view &&
          current.view.id === next.view.id &&
          current.view.version > next.view.version
            ? current
            : next,
        );
      setConnected(true);
      setLoaded(true);
    } catch (e) {
      setConnected(false);
      setError((e as Error).message);
      setLoaded(true);
    } finally {
      flight.current = false;
    }
  }, [path]);
  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), realtime ? 10000 : 2500);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", focus);
    };
  }, [refresh, realtime]);
  const topic = state.view?.topic;
  useEffect(() => {
    const client = browserSupabase();
    if (!client || !topic) return;
    const channel = client
      .channel("group:" + topic)
      .on("broadcast", { event: "changed" }, () => void refresh())
      .subscribe((status) => {
        setRealtime(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") void refresh();
      });
    return () => {
      setRealtime(false);
      void client.removeChannel(channel);
    };
  }, [topic, refresh]);
  async function perform(data: Record<string, unknown>) {
    changeEpoch.current++;
    setBusy(true);
    setError("");
    const fingerprint = JSON.stringify(data);
    const key =
      retry.current?.fingerprint === fingerprint
        ? retry.current.key
        : createClientId();
    retry.current = { fingerprint, key };
    try {
      const result = await api<{
        view?: GroupView & { closed?: boolean };
        order?: Order;
      }>(path, {
        method: "POST",
        body: JSON.stringify({ ...data, mutationId: key }),
      });
      retry.current = null;
      changeEpoch.current++;
      if (result.view?.closed) {
        setState((s) => ({ ...s, view: null, active: false }));
        setOpened(false);
      } else if (result.view)
        setState((s) =>
          s.view &&
          s.view.id === result.view!.id &&
          s.view.version > result.view!.version
            ? s
            : { ...s, view: result.view! },
        );
      if (result.order) {
        writeStored("brasa_last_" + table.token, result.order.trackingToken);
        router.push("/pedido/" + result.order.trackingToken);
      }
      return result;
    } catch (e) {
      changeEpoch.current++;
      setError((e as Error).message);
      await refresh();
      throw e;
    } finally {
      setBusy(false);
    }
  }
  const view = state.view,
    owner = !!view && view.ownerId === view.me.id,
    canEdit =
      !!view &&
      view.me.approved &&
      ["waiting", "editing"].includes(view.status);
  async function add(line: CartLine) {
    if (!canEdit)
      throw new Error(
        view?.me.approved
          ? "O responsável está revisando ou já enviou esta rodada."
          : "Aguarde a aprovação da equipe.",
      );
    await perform(
      editing
        ? {
            action: "update",
            itemId: editing.id,
            version: editing.version,
            item: line,
          }
        : { action: "add", item: line },
    );
    setEditing(null);
  }
  const act = (data: Record<string, unknown>) => {
    const item = view?.items.find((i) => i.id === data.itemId);
    void perform(data)
      .then(() => {
        if (data.action === "review") track("checkout_start");
        if (data.action === "remove" && item)
          track("remove_from_cart", item.productId);
      })
      .catch(() => {});
  };
  const context: Context = {
    view,
    busy,
    loaded,
    enabled: state.config.collectiveEnabled,
    active: !!state.active,
    editing,
    setEditing,
    open: () => setOpened(true),
    add,
  };
  return (
    <Collective.Provider value={context}>
      <div style={{ "--accent": accent } as React.CSSProperties}>
        {children}
        {view && view.me.approved && !opened && (
          <button
            className="brasa-group-floating button primary"
            onClick={() => setOpened(true)}
          >
            <Users size={18} />
            Pedido coletivo · {money(view.total)}
          </button>
        )}
        {opened && (
          <Modal
            label="Pedido coletivo"
            onClose={() => {
              if (!busy) setOpened(false);
            }}
            wide={!!view?.me.approved}
          >
            <div className="brasa-group-dialog">
              <span className="eyebrow">{table.name} · JUNTO É MELHOR</span>
              <h2>{view ? "A mesa de vocês." : "Vamos pedir juntos."}</h2>
              {error && (
                <p className="notice error" role="alert">
                  {error}
                  <button className="text-link" onClick={() => void refresh()}>
                    Atualizar
                  </button>
                </p>
              )}
              {!connected && (
                <p className="notice">
                  <WifiOff size={16} />
                  Reconectando. As alterações só são confirmadas após salvar no
                  servidor.
                </p>
              )}
              {!view ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    act({
                      action: "join",
                      name,
                      pin: pin || undefined,
                      analyticsSessionId: analyticsSessionId(),
                    });
                  }}
                >
                  <p className="muted">
                    {state.active
                      ? "Existe uma sessão aberta nesta mesa. Entre para participar."
                      : "Você será o responsável por revisar e enviar o pedido."}
                  </p>
                  <label className="brasa-social-field">
                    Seu nome ou apelido
                    <input
                      required
                      maxLength={40}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="nickname"
                    />
                  </label>
                  {state.config.entryMode === "pin" && (
                    <label className="brasa-social-field">
                      Senha da mesa
                      <input
                        type="password"
                        required
                        maxLength={100}
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                      />
                    </label>
                  )}
                  {state.config.entryMode === "approval" && (
                    <p className="notice">
                      A equipe aprovará sua entrada antes de adicionar produtos.
                    </p>
                  )}
                  <button
                    className="button primary full"
                    disabled={busy || !name.trim()}
                  >
                    {busy ? <Spinner /> : "Participar do pedido"}
                  </button>
                </form>
              ) : !view.me.approved ? (
                <div className="empty">
                  <LockKeyhole size={32} />
                  <h3>
                    {view.me.denied
                      ? "Entrada não aprovada."
                      : "Aguardando a equipe."}
                  </h3>
                  <p>Peça ajuda a um funcionário da casa.</p>
                  <button
                    className="button secondary"
                    onClick={() => void refresh()}
                  >
                    Conferir aprovação
                  </button>
                </div>
              ) : (
                <>
                  <div className="brasa-group-status">
                    <span>{groupLabels[view.status]}</span>
                    <small>
                      {realtime
                        ? "Atualizações em tempo real"
                        : "Recuperação automática por consulta"}
                    </small>
                  </div>
                  <div className="brasa-group-members">
                    {view.participants.map((p, i) => (
                      <span key={p.id}>
                        <i
                          style={{
                            background: [
                              "#e2e9db",
                              "#f2e1d4",
                              "#e2e8ed",
                              "#eee0ea",
                            ][i % 4],
                          }}
                        >
                          {p.name[0]?.toUpperCase()}
                        </i>
                        {p.name}
                        {p.id === view.ownerId && <Crown size={13} />}{" "}
                        {!p.approved && "(aguardando)"}
                      </span>
                    ))}
                  </div>
                  <form
                    className="brasa-social-inline"
                    onSubmit={(e) => {
                      e.preventDefault();
                      act({
                        action: "rename",
                        name: name.trim() || view.me.name,
                      });
                    }}
                  >
                    <input
                      aria-label="Alterar meu apelido"
                      maxLength={40}
                      placeholder={view.me.name}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                    <button
                      className="button ghost"
                      disabled={busy || !name.trim()}
                    >
                      Salvar apelido
                    </button>
                  </form>
                  {view.quoteError && (
                    <p className="notice error">
                      {view.quoteError} · Remova ou revise o produto antes de
                      enviar.
                    </p>
                  )}
                  <div className="brasa-group-columns">
                    <div>
                      {view.participants
                        .filter((p) => p.approved)
                        .map((p) => (
                          <section className="brasa-group-person" key={p.id}>
                            <h3>
                              <UserRound size={16} />
                              {p.name}
                              <small>{p.id === view.me.id ? "Você" : ""}</small>
                            </h3>
                            {view.items
                              .filter((i) => i.participantId === p.id)
                              .map((item) => (
                                <article
                                  key={item.id}
                                  className="brasa-group-line"
                                >
                                  <div>
                                    <b>
                                      {item.quantity}× {item.name}
                                    </b>
                                    <p>
                                      {item.modifiers
                                        .map((m) => m.name)
                                        .join(" · ")}
                                    </p>
                                    {item.notes && (
                                      <p className="kitchen-note">
                                        {item.notes}
                                      </p>
                                    )}
                                    <strong>{money(item.total)}</strong>
                                  </div>
                                  {canEdit &&
                                    (p.id === view.me.id || owner) && (
                                      <div className="brasa-group-line-actions">
                                        {p.id === view.me.id && (
                                          <>
                                            <button
                                              className="icon-button"
                                              disabled={
                                                busy || item.quantity <= 1
                                              }
                                              aria-label={`Diminuir ${item.name} de ${p.name}`}
                                              onClick={() =>
                                                act({
                                                  action: "update",
                                                  itemId: item.id,
                                                  version: item.version,
                                                  item: {
                                                    ...item,
                                                    quantity: item.quantity - 1,
                                                  },
                                                })
                                              }
                                            >
                                              <Minus size={15} />
                                            </button>
                                            <button
                                              className="icon-button"
                                              disabled={
                                                busy || item.quantity >= 20
                                              }
                                              aria-label={`Aumentar ${item.name} de ${p.name}`}
                                              onClick={() =>
                                                act({
                                                  action: "update",
                                                  itemId: item.id,
                                                  version: item.version,
                                                  item: {
                                                    ...item,
                                                    quantity: item.quantity + 1,
                                                  },
                                                })
                                              }
                                            >
                                              <Plus size={15} />
                                            </button>
                                            <button
                                              className="text-link"
                                              disabled={busy}
                                              onClick={() => {
                                                setEditing(item);
                                                setOpened(false);
                                              }}
                                            >
                                              Personalizar
                                            </button>
                                          </>
                                        )}
                                        <button
                                          className="icon-button"
                                          disabled={busy}
                                          aria-label={`Remover ${item.name} de ${p.name}`}
                                          onClick={() =>
                                            act({
                                              action: "remove",
                                              itemId: item.id,
                                              version: item.version,
                                            })
                                          }
                                        >
                                          <Trash2 size={16} />
                                        </button>
                                      </div>
                                    )}
                                </article>
                              ))}
                            {!view.items.some(
                              (i) => i.participantId === p.id,
                            ) && (
                              <p className="muted">
                                Ainda sem itens nesta rodada.
                              </p>
                            )}
                            <p className="brasa-group-subtotal">
                              Total individual, todas as rodadas{" "}
                              <b>
                                {money(
                                  view.individual.find(
                                    (i) => i.participantId === p.id,
                                  )?.total || 0,
                                )}
                              </b>
                            </p>
                          </section>
                        ))}
                      {canEdit && (
                        <button
                          className="button secondary full"
                          onClick={() => setOpened(false)}
                        >
                          Continuar escolhendo no cardápio <Plus size={16} />
                        </button>
                      )}
                    </div>
                    <aside className="brasa-group-summary">
                      <span className="eyebrow">RESUMO DA MESA</span>
                      <h3>{money(view.total)}</h3>
                      <p>Inclui os itens enviados nas rodadas anteriores.</p>
                      <h4>Divisão igualitária</h4>
                      {view.equal.map((x) => (
                        <div key={x.participantId}>
                          <span>
                            {
                              view.participants.find(
                                (p) => p.id === x.participantId,
                              )?.name
                            }
                          </span>
                          <b>{money(x.total)}</b>
                        </div>
                      ))}
                      <p className="fine-print">
                        Organização de valores. Não realiza pagamentos. Centavos
                        são distribuídos mantendo o total exato.
                      </p>
                      {view.orders.map((o) => (
                        <a
                          className="button secondary full"
                          key={o.id}
                          href={"/pedido/" + o.trackingToken}
                        >
                          Acompanhar pedido #{String(o.number).padStart(4, "0")}
                        </a>
                      ))}
                      {owner && (
                        <>
                          {canEdit && (
                            <>
                              <button
                                className="button ghost full"
                                disabled={busy}
                                onClick={() =>
                                  act({
                                    action: "entry",
                                    closed: !view.joinClosed,
                                  })
                                }
                              >
                                {view.joinClosed
                                  ? "Reabrir entrada"
                                  : "Encerrar entrada de participantes"}
                              </button>
                              <button
                                className="button primary full"
                                disabled={
                                  busy ||
                                  !view.items.length ||
                                  !!view.quoteError
                                }
                                onClick={() => act({ action: "review" })}
                              >
                                Revisar pedido coletivo <ArrowRight size={16} />
                              </button>
                            </>
                          )}
                          {view.status === "review" && (
                            <>
                              <p className="notice">
                                Os itens estão bloqueados para revisão. Confira
                                participantes, observações e valores antes de
                                enviar.
                              </p>
                              <label className="brasa-social-field">
                                Pagamento
                                <select
                                  value={payment}
                                  onChange={(e) =>
                                    setPayment(
                                      e.target.value as "cashier" | "table",
                                    )
                                  }
                                >
                                  {payments.map((p) => (
                                    <option value={p} key={p}>
                                      {p === "cashier" ? "No caixa" : "Na mesa"}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <button
                                className="button primary full"
                                disabled={busy || !!view.quoteError}
                                onClick={() =>
                                  act({ action: "checkout", payment })
                                }
                              >
                                {busy ? <Spinner /> : <Check size={16} />}
                                Confirmar e enviar à cozinha
                              </button>
                              <button
                                className="button ghost full"
                                disabled={busy}
                                onClick={() => act({ action: "edit" })}
                              >
                                Voltar à edição
                              </button>
                            </>
                          )}
                          {["sent", "preparing", "finished"].includes(
                            view.status,
                          ) &&
                            view.config.allowNewRounds && (
                              <button
                                className="button primary full"
                                disabled={busy}
                                onClick={() => act({ action: "round" })}
                              >
                                Iniciar nova rodada
                              </button>
                            )}
                          <button
                            className="text-link"
                            disabled={busy}
                            onClick={() => {
                              if (
                                window.confirm(
                                  "Encerrar a sessão coletiva? Os pedidos já enviados serão preservados.",
                                )
                              )
                                act({ action: "close" });
                            }}
                          >
                            Encerrar sessão
                          </button>
                        </>
                      )}
                    </aside>
                  </div>
                </>
              )}
            </div>
          </Modal>
        )}
      </div>
    </Collective.Provider>
  );
}
