"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  UtensilsCrossed,
  Layers,
  Box,
  SlidersHorizontal,
  ReceiptText,
  ChefHat,
  Armchair,
  QrCode,
  Users,
  ChartNoAxesCombined,
  Settings,
  Plus,
  ArrowUpRight,
  ArrowRight,
  Search,
  LogOut,
  Flame,
  Pencil,
  Check,
  Upload,
  Download,
  Printer,
  Menu as MenuIcon,
  Eye,
  ShoppingBag,
  TrendingUp,
  Clock,
  Save,
  Trash2,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import QRCode from "qrcode";
import { api } from "@/lib/client";
import { createClientId } from "@/lib/client-id";
import { useHydrated } from "@/lib/use-hydrated";
import {
  money,
  statusLabels,
  type Catalog,
  type Product,
  type Order,
  type Staff,
  type ModifierGroup,
} from "@/lib/types";
import { Brand, Modal, Empty, Spinner } from "./ui";
import ProductMediaEditor from "./product-media-editor";
import { hasModel3d } from "@/lib/product-media";
type Event = {
  type: string;
  product_id: string | null;
  category_id: string | null;
  session_id: string;
  created_at: string;
};
type AdminData = {
  catalog: Catalog;
  orders: Order[];
  staff: Staff[];
  events: Event[];
  since: string;
  days: number;
};
const sections = [
  ["dashboard", "Visão geral", LayoutDashboard],
  ["menu", "Cardápio", UtensilsCrossed],
  ["categories", "Categorias", Layers],
  ["products", "Produtos", ShoppingBag],
  ["models", "Modelos 3D", Box],
  ["modifiers", "Personalizações", SlidersHorizontal],
  ["orders", "Pedidos", ReceiptText],
  ["kitchen", "Painel da cozinha", ChefHat],
  ["tables", "Mesas", Armchair],
  ["qr", "QR Codes", QrCode],
  ["staff", "Funcionários", Users],
  ["reports", "Relatórios", ChartNoAxesCombined],
  ["settings", "Configurações", Settings],
] as const;
export default function Admin() {
  const hydrated = useHydrated();
  const [data, setData] = useState<AdminData | null>(null),
    [section, setSection] = useState("dashboard"),
    [days, setDays] = useState(30),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [editor, setEditor] = useState<Product | null>(null),
    [mobile, setMobile] = useState(false),
    [search, setSearch] = useState("");
  const load = useCallback(async () => {
    try {
      setData(await api<AdminData>(`/api/admin?days=${days}`));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [days]);
  useEffect(() => {
    void load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  async function save(action: string, value: unknown) {
    setBusy(true);
    setError("");
    try {
      await api("/api/admin", {
        method: "POST",
        body: JSON.stringify({ action, data: value }),
      });
      await load();
      setToast("Alterações salvas.");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const catalog = data?.catalog;
  const title = sections.find((s) => s[0] === section)?.[1];
  function newProduct() {
    if (!catalog?.categories.length) {
      setError("Crie uma categoria primeiro.");
      return;
    }
    setEditor({
      id: `produto-${Date.now()}`,
      name: "",
      description: "",
      ingredients: "",
      categoryId: catalog.categories[0].id,
      price: 0,
      image: "",
      available: true,
      featured: false,
      allergens: [],
      prepMinutes: 20,
      groups: [],
    });
  }
  return (
    <div className="admin-app">
      <aside className={`admin-sidebar ${mobile ? "is-open" : ""}`}>
        <Brand
          name={catalog?.settings.name}
          logo={catalog?.settings.logo}
          subtitle={catalog?.settings.brandSubtitle}
        />
        <span className="sidebar-label">ESPAÇO DO RESTAURANTE</span>
        <nav>
          {sections.map(([id, label, Icon]) =>
            id === "kitchen" ? (
              <Link href="/cozinha" key={id}>
                <Icon size={18} />
                {label}
                <ArrowUpRight size={13} />
              </Link>
            ) : (
              <button
                className={section === id ? "selected" : ""}
                disabled={!hydrated || !data}
                key={id}
                onClick={() => {
                  setSection(id);
                  setMobile(false);
                  setSearch("");
                }}
              >
                <Icon size={18} />
                {label}
                {id === "orders" && (
                  <span>
                    {data?.orders.filter((o) => o.status !== "delivered")
                      .length || 0}
                  </span>
                )}
              </button>
            ),
          )}
        </nav>
        <div className="sidebar-bottom">
          <Link href="/" target="_blank">
            <ArrowUpRight size={17} /> Ver cardápio público
          </Link>
          <button
            disabled={!hydrated}
            onClick={async () => {
              await api("/api/auth", { method: "DELETE" });
              window.location.assign("/equipe");
            }}
          >
            <LogOut size={17} /> Sair da conta
          </button>
          <small>UMA CASA. INFINITAS POSSIBILIDADES.</small>
        </div>
      </aside>
      <div className="admin-content">
        <header className="admin-header">
          <div>
            <button
              className="icon-button mobile-menu"
              aria-label="Abrir navegação"
              onClick={() => setMobile(!mobile)}
            >
              <MenuIcon size={20} />
            </button>
            <span>
              Gestão do restaurante <span>/</span> <b>{title}</b>
            </span>
          </div>
          <div>
            <span className="backend-label">
              <i />
              {catalog?.backend === "sqlite"
                ? "Demonstração local"
                : "Supabase"}
            </span>
            <span className="admin-avatar">A</span>
          </div>
        </header>
        <main className="admin-main">
          <div className="admin-page-heading">
            <div>
              <span className="eyebrow">TUDO NO SEU LUGAR</span>
              <h1>
                {section === "dashboard" ? "Um bom dia começa aqui" : title}
                <span>.</span>
              </h1>
              <p>
                {section === "dashboard"
                  ? "Sua operação, seus números e as próximas boas histórias."
                  : "Controle os detalhes que fazem a experiência acontecer."}
              </p>
            </div>
            {["dashboard", "reports", "orders"].includes(section) && (
              <select
                aria-label="Período dos dados"
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              >
                <option value={1}>Últimas 24 horas</option>
                <option value={7}>Últimos 7 dias</option>
                <option value={30}>Últimos 30 dias</option>
                <option value={90}>Últimos 90 dias</option>
                <option value={365}>Últimos 365 dias</option>
              </select>
            )}
          </div>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          {!data ? (
            <div className="empty">
              <Spinner />
              <p>Carregando a operação…</p>
              <button className="button secondary" onClick={() => void load()}>
                Tentar novamente
              </button>
            </div>
          ) : (
            <>
              {["dashboard", "reports"].includes(section) && (
                <Reports data={data} detailed={section === "reports"} />
              )}
              {["menu", "products", "models", "modifiers"].includes(
                section,
              ) && (
                <>
                  <div className="panel-toolbar">
                    <div>
                      <h3>
                        {section === "models"
                          ? "Acervo 3D"
                          : section === "modifiers"
                            ? "Do jeito do cliente"
                            : "Produtos da casa"}
                      </h3>
                      <p>
                        {section === "models"
                          ? "Associe GLB/GLTF e USDZ aos pratos. Upload de até 30 MB; GLTF deve ser autocontido ou convertido para GLB."
                          : section === "modifiers"
                            ? "Grupos obrigatórios, limites de escolha e preços adicionais."
                            : `${catalog?.products.length} produtos cadastrados · Alterações refletem no cardápio público.`}
                      </p>
                    </div>
                    <div>
                      <label className="search-input">
                        <Search size={16} />
                        <input
                          aria-label="Buscar produtos"
                          placeholder="Buscar produto…"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </label>
                      <button className="button primary" onClick={newProduct}>
                        <Plus size={17} /> Novo produto
                      </button>
                    </div>
                  </div>
                  <div className="admin-products">
                    {catalog!.products
                      .filter((p) =>
                        p.name.toLowerCase().includes(search.toLowerCase()),
                      )
                      .map((p) => (
                        <article className="admin-product" key={p.id}>
                          <img src={p.image} alt={p.name} />
                          <div>
                            <div>
                              <h3>{p.name}</h3>
                              <span
                                className={`status-badge ${p.available ? "confirmed" : "received"}`}
                              >
                                {p.available ? "Ativo" : "Pausado"}
                              </span>
                            </div>
                            <p>
                              {
                                catalog!.categories.find(
                                  (c) => c.id === p.categoryId,
                                )?.name
                              }{" "}
                              · {money(p.price)}
                            </p>
                            {section === "models" ? (
                              <small>
                                <Box size={13} />
                                {p.modelUrl
                                  ? hasModel3d(p)
                                    ? p.arEnabled === false
                                      ? "3D ativo · AR desativada"
                                      : "3D + AR habilitados"
                                    : "Modelo associado · publicação pausada"
                                  : "Sem modelo 3D"}
                                {p.usdzUrl ? " · USDZ incluído" : ""}
                              </small>
                            ) : section === "modifiers" ? (
                              <small>
                                {p.groups.length} grupos ·{" "}
                                {p.groups.reduce(
                                  (s, g) => s + g.options.length,
                                  0,
                                )}{" "}
                                opções
                              </small>
                            ) : (
                              <small>{p.description}</small>
                            )}
                            <div className="admin-product-actions">
                              <button
                                className="button secondary"
                                onClick={() => setEditor(p)}
                              >
                                <Pencil size={14} />
                                {section === "models"
                                  ? "Gerenciar arquivos"
                                  : section === "modifiers"
                                    ? "Editar personalizações"
                                    : "Editar produto"}
                              </button>
                              <button
                                className="icon-button"
                                disabled={busy}
                                aria-label={`${p.available ? "Pausar" : "Ativar"} ${p.name}`}
                                onClick={() =>
                                  void save("product", {
                                    ...p,
                                    available: !p.available,
                                  })
                                }
                              >
                                {p.available ? (
                                  <Eye size={17} />
                                ) : (
                                  <Check size={17} />
                                )}
                              </button>
                            </div>
                          </div>
                        </article>
                      ))}
                  </div>
                </>
              )}
              {section === "categories" && (
                <CategoryPanel catalog={catalog!} save={save} busy={busy} />
              )}
              {section === "tables" && (
                <TablePanel catalog={catalog!} save={save} busy={busy} />
              )}
              {section === "qr" && <QRPanel catalog={catalog!} />}
              {section === "orders" && <OrdersPanel orders={data.orders} />}
              {section === "staff" && (
                <StaffPanel staff={data.staff} save={save} busy={busy} />
              )}
              {section === "settings" && (
                <SettingsPanel catalog={catalog!} save={save} busy={busy} />
              )}
            </>
          )}
        </main>
        <footer className="admin-footer">
          <Flame size={13} /> {catalog?.settings.name || "Sua casa"} · Gestão
          que deixa o sabor acontecer.
          <span>
            Instalação independente ·{" "}
            {catalog?.backend === "sqlite" ? "SQLite" : "PostgreSQL"}
          </span>
        </footer>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
      {editor && catalog && (
        <ProductEditor
          product={editor}
          catalog={catalog}
          initialTab={section === "models" ? "models" : "details"}
          onClose={() => setEditor(null)}
          onSave={async (p) => {
            const ok = await save("product", p);
            if (ok) setEditor(null);
            return ok;
          }}
        />
      )}
    </div>
  );
}
function Reports({ data, detailed }: { data: AdminData; detailed: boolean }) {
  const { orders, events, catalog } = data;
  const total = orders.reduce((s, o) => s + o.total, 0);
  const delivered = orders.filter((o) => o.status === "delivered");
  const chart = useMemo(() => {
    const count = Math.min(data.days, 30);
    return Array.from({ length: count }, (_, i) => {
      const at = new Date(Date.now() - (count - 1 - i) * 86400000);
      const key = at.toLocaleDateString("en-CA", {
        timeZone: catalog.settings.timezone,
      });
      return {
        date: at.toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          timeZone: catalog.settings.timezone,
        }),
        value:
          orders
            .filter(
              (o) =>
                new Date(o.createdAt).toLocaleDateString("en-CA", {
                  timeZone: catalog.settings.timezone,
                }) === key,
            )
            .reduce((s, o) => s + o.total, 0) / 100,
      };
    });
  }, [orders, data.days, catalog.settings.timezone]);
  const products = catalog.products
    .map((p) => {
      const lines = orders.flatMap((o) =>
        o.items.filter((i) => i.productId === p.id),
      );
      const views = events.filter(
        (e) => e.type === "product_view" && e.product_id === p.id,
      );
      const viewers = new Set(views.map((e) => e.session_id)).size;
      const carts = new Set(
        events
          .filter((e) => e.type === "add_to_cart" && e.product_id === p.id)
          .map((e) => e.session_id),
      ).size;
      return {
        ...p,
        units: lines.reduce((s, i) => s + i.quantity, 0),
        revenue: lines.reduce((s, i) => s + i.total, 0),
        views: views.length,
        conversion: viewers ? Math.min(100, (carts / viewers) * 100) : 0,
      };
    })
    .sort((a, b) => b.units - a.units);
  const metrics = [
    [
      "Valor dos pedidos",
      money(total),
      TrendingUp,
      "Total pedido; pagamento não conciliado",
    ],
    [
      "Pedidos recebidos",
      String(orders.length),
      ShoppingBag,
      `${delivered.length} entregues no período`,
    ],
    [
      "Ticket médio",
      money(orders.length ? Math.round(total / orders.length) : 0),
      ReceiptText,
      "Valor dos pedidos ÷ quantidade",
    ],
    [
      "Interações com 3D",
      String(events.filter((e) => e.type === "model_view").length),
      Box,
      `${events.filter((e) => e.type === "ar_start").length} ativações de AR`,
    ],
  ] as const;
  function csv() {
    const rows = [
      [
        "Produto",
        "Unidades",
        "Valor de pedidos BRL",
        "Visualizações",
        "Conversão vista para carrinho %",
      ],
      ...products.map((p) => [
        p.name,
        p.units,
        (p.revenue / 100).toFixed(2),
        p.views,
        p.conversion.toFixed(1),
      ]),
    ];
    const text =
      "\uFEFF" +
      rows
        .map((r) =>
          r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"),
        )
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "relatorio-brasa.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <div className="metrics-grid">
        {metrics.map(([label, value, Icon, note]) => (
          <article className="metric-card" key={label}>
            <div>
              <span>{label}</span>
              <Icon size={19} />
            </div>
            <strong>{value}</strong>
            <small>{note}</small>
          </article>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="admin-panel chart-panel">
          <header>
            <div>
              <h3>O movimento da casa</h3>
              <p>Valor dos pedidos · últimos {Math.min(data.days, 30)} dias</p>
            </div>
            <span className="chart-legend">
              <i />
              Pedidos em R$
            </span>
          </header>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={chart}>
                <defs>
                  <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#b94b2d" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#b94b2d" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 5"
                  vertical={false}
                  stroke="#eae7e1"
                />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  minTickGap={35}
                  tick={{ fontSize: 11, fill: "#8b8b82" }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "#8b8b82" }}
                />
                <Tooltip
                  formatter={(value) => money(Math.round(Number(value) * 100))}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  name="Valor dos pedidos"
                  stroke="#b94b2d"
                  strokeWidth={2.5}
                  fill="url(#chartFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {orders.length === 0 && (
            <p className="chart-empty-note">
              Os números começam com o primeiro pedido. Nenhuma venda fictícia.
            </p>
          )}
        </section>
        <section className="admin-panel">
          <header>
            <div>
              <h3>Os favoritos da casa</h3>
              <p>Produtos mais pedidos</p>
            </div>
            <Flame size={20} />
          </header>
          <div className="top-products">
            {products
              .filter((p) => p.units > 0)
              .slice(0, 4)
              .map((p, i) => (
                <div key={p.id}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <img src={p.image} alt="" />
                  <div>
                    <b>{p.name}</b>
                    <small>{p.units} unidades</small>
                  </div>
                  <strong>{money(p.revenue)}</strong>
                </div>
              ))}
            {orders.length === 0 && (
              <Empty title="Seu próximo favorito vem aí">
                <p>Os produtos aparecem aqui conforme os pedidos chegam.</p>
              </Empty>
            )}
          </div>
        </section>
      </div>
      <div className="operations-callout">
        <span>
          <ChefHat size={25} />
        </span>
        <div>
          <h3>Tem sabor acontecendo na cozinha.</h3>
          <p>
            {orders.filter((o) => o.status !== "delivered").length} pedidos em
            andamento. Acompanhe cada etapa do preparo.
          </p>
        </div>
        <Link className="button primary" href="/cozinha">
          Abrir painel da cozinha <ArrowUpRight size={16} />
        </Link>
      </div>
      {detailed && (
        <>
          <section className="admin-panel">
            <header>
              <div>
                <h3>Produtos & conversão</h3>
                <p>
                  Conversão: sessões que adicionaram ao carrinho ÷ sessões que
                  viram o produto.
                </p>
              </div>
              <button className="button secondary" onClick={csv}>
                <Download size={15} /> Exportar CSV
              </button>
            </header>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Unidades</th>
                    <th>Valor dos pedidos</th>
                    <th>Visualizações</th>
                    <th>Vista → carrinho</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td>{p.units}</td>
                      <td>{money(p.revenue)}</td>
                      <td>{p.views}</td>
                      <td>{p.conversion.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <div className="dashboard-grid">
            <section className="admin-panel">
              <header>
                <h3>Pedidos por mesa</h3>
              </header>
              <div className="stat-list">
                {catalog.tables.map((t) => (
                  <div key={t.id}>
                    <span>{t.name}</span>
                    <b>
                      {orders.filter((o) => o.tableId === t.id).length} pedidos
                    </b>
                  </div>
                ))}
              </div>
            </section>
            <section className="admin-panel">
              <header>
                <h3>Categorias mais acessadas</h3>
              </header>
              <div className="stat-list">
                {catalog.categories.map((c) => (
                  <div key={c.id}>
                    <span>{c.name}</span>
                    <b>
                      {
                        events.filter(
                          (e) =>
                            e.type === "category_view" &&
                            e.category_id === c.id,
                        ).length
                      }{" "}
                      acessos
                    </b>
                  </div>
                ))}
              </div>
              <header>
                <h3>Horários de movimento</h3>
              </header>
              <div className="stat-list">
                {Array.from({ length: 24 }, (_, hour) => ({
                  hour,
                  count: orders.filter(
                    (o) =>
                      Number(
                        new Intl.DateTimeFormat("en-GB", {
                          timeZone: catalog.settings.timezone,
                          hour: "2-digit",
                          hourCycle: "h23",
                        }).format(new Date(o.createdAt)),
                      ) === hour,
                  ).length,
                }))
                  .filter((h) => h.count > 0)
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 5)
                  .map((h) => (
                    <div key={h.hour}>
                      <span>
                        {h.hour}h — {h.hour + 1}h
                      </span>
                      <b>{h.count} pedidos</b>
                    </div>
                  ))}
                {orders.length === 0 && (
                  <p className="muted">Sem pedidos no período.</p>
                )}
              </div>
            </section>
          </div>
          <p className="fine-print">
            Indicadores consideram até 2.000 pedidos e 50.000 eventos recentes
            por consulta. O valor de pedidos não representa faturamento
            recebido; não há conciliação de pagamentos nesta instalação.
          </p>
        </>
      )}
    </>
  );
}
function CategoryPanel({
  catalog,
  save,
  busy,
}: {
  catalog: Catalog;
  save: (a: string, d: unknown) => Promise<boolean>;
  busy: boolean;
}) {
  const [editing, setEditing] = useState<Catalog["categories"][number] | null>(
    null,
  );
  return (
    <section className="admin-panel">
      <header>
        <div>
          <h3>Cada sabor no seu lugar</h3>
          <p>Organize as categorias pela posição de exibição.</p>
        </div>
        <button
          className="button primary"
          onClick={() =>
            setEditing({
              id: `categoria-${Date.now()}`,
              name: "",
              icon: "burger",
              position: catalog.categories.length,
            })
          }
        >
          <Plus size={16} /> Nova categoria
        </button>
      </header>
      <div className="stat-list">
        {catalog.categories.map((c) => (
          <div key={c.id}>
            <span>
              <b>{c.position + 1}.</b> {c.name}{" "}
              <small>
                · {catalog.products.filter((p) => p.categoryId === c.id).length}{" "}
                produtos
              </small>
            </span>
            <button className="button secondary" onClick={() => setEditing(c)}>
              <Pencil size={14} /> Editar
            </button>
          </div>
        ))}
      </div>
      {editing && (
        <Modal label="Editar categoria" onClose={() => setEditing(null)}>
          <form
            className="edit-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await save("category", editing)) setEditing(null);
            }}
          >
            <h2>Categoria</h2>
            <label>
              Nome
              <input
                required
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
            </label>
            <label>
              Posição (a partir de zero)
              <input
                type="number"
                min={0}
                max={100}
                value={editing.position}
                onChange={(e) =>
                  setEditing({ ...editing, position: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Ícone
              <select
                value={editing.icon}
                onChange={(e) =>
                  setEditing({ ...editing, icon: e.target.value })
                }
              >
                {["burger", "fries", "combo", "drink", "sweet"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <button disabled={busy} className="button primary">
              Salvar categoria
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
function TablePanel({
  catalog,
  save,
  busy,
}: {
  catalog: Catalog;
  save: (a: string, d: unknown) => Promise<boolean>;
  busy: boolean;
}) {
  const [name, setName] = useState("");
  return (
    <>
      <form
        className="inline-form admin-panel"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await save("table", { id: createClientId(), name, active: true }))
            setName("");
        }}
      >
        <label>
          Nova mesa
          <input
            required
            maxLength={60}
            placeholder="Ex.: Varanda 01"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button disabled={busy} className="button primary">
          <Plus size={16} /> Criar mesa
        </button>
      </form>
      <div className="tables-grid">
        {catalog.tables.map((t) => (
          <div className="table-card" key={t.id}>
            <Armchair size={30} />
            <h3>{t.name}</h3>
            <span
              className={`status-badge ${t.active ? "confirmed" : "received"}`}
            >
              {t.active ? "Disponível" : "Desativada"}
            </span>
            <div>
              <button
                disabled={busy}
                className="button secondary"
                onClick={() =>
                  void save("table", {
                    id: t.id,
                    name: t.name,
                    active: !t.active,
                  })
                }
              >
                {t.active ? "Desativar" : "Ativar"}
              </button>
              <button
                disabled={busy}
                className="icon-button"
                aria-label={`Renomear ${t.name}`}
                onClick={() => {
                  const name = window.prompt("Nome da mesa", t.name);
                  if (name?.trim())
                    void save("table", {
                      id: t.id,
                      name: name.trim(),
                      active: t.active,
                    });
                }}
              >
                <Pencil size={15} />
              </button>
            </div>
            <small>QR individual · acesso sem cadastro</small>
          </div>
        ))}
      </div>
    </>
  );
}
function QRPanel({ catalog }: { catalog: Catalog }) {
  const [base, setBase] = useState(""),
    [images, setImages] = useState<Record<string, string>>({}),
    [error, setError] = useState("");
  useEffect(
    () => setBase(process.env.NEXT_PUBLIC_APP_URL || window.location.origin),
    [],
  );
  useEffect(() => {
    let active = true;
    if (!base) return;
    try {
      const url = new URL(base);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    } catch {
      setError("Informe uma URL HTTP ou HTTPS válida.");
      return;
    }
    setError("");
    Promise.all(
      catalog.tables
        .filter((t) => t.active)
        .map(
          async (t) =>
            [
              t.id,
              await QRCode.toDataURL(
                `${base.replace(/\/$/, "")}/?mesa=${encodeURIComponent(t.token)}`,
                {
                  width: 500,
                  margin: 2,
                  color: { dark: "#252b26", light: "#ffffff" },
                },
              ),
            ] as const,
        ),
    ).then((entries) => {
      if (active) setImages(Object.fromEntries(entries));
    });
    return () => {
      active = false;
    };
  }, [base, catalog.tables]);
  return (
    <>
      <div className="panel-toolbar">
        <div>
          <h3>O primeiro passo de uma boa experiência.</h3>
          <p>
            Use o domínio HTTPS da instalação. Para testar no celular, use um
            endereço acessível na mesma rede.
          </p>
        </div>
        <button
          className="button primary"
          disabled={!!error}
          onClick={() => window.print()}
        >
          <Printer size={16} /> Imprimir QR Codes
        </button>
      </div>
      <label className="base-url-label">
        Endereço público
        <input
          type="url"
          value={base}
          onChange={(e) => setBase(e.target.value)}
        />
      </label>
      {error && <p className="notice error">{error}</p>}
      <div className="qr-grid" id="qr-sheet">
        {catalog.tables
          .filter((t) => t.active)
          .map((t) => (
            <article className="qr-card" key={t.id}>
              <Brand
                name={catalog.settings.name}
                logo={catalog.settings.logo}
                subtitle={catalog.settings.brandSubtitle}
                small
              />
              <p>
                Seu próximo favorito
                <br />
                <em>começa aqui.</em>
              </p>
              {images[t.id] && (
                <img src={images[t.id]} alt={`QR Code ${t.name}`} />
              )}
              <h3>{t.name}</h3>
              <span>ESCANEIE. ESCOLHA. APROVEITE.</span>
              <div className="qr-card-actions">
                <a
                  className="button secondary"
                  href={images[t.id]}
                  download={`qr-${t.name}.png`}
                >
                  <Download size={15} /> Baixar
                </a>
                <a
                  className="button secondary"
                  target="_blank"
                  href={`${base.replace(/\/$/, "")}/?mesa=${encodeURIComponent(t.token)}`}
                >
                  Testar <ArrowUpRight size={14} />
                </a>
              </div>
            </article>
          ))}
      </div>
    </>
  );
}
function OrdersPanel({ orders }: { orders: Order[] }) {
  const [filter, setFilter] = useState("all"),
    [order, setOrder] = useState<Order | null>(null);
  return (
    <section className="admin-panel">
      <header>
        <h3>Pedidos do período</h3>
        <select
          aria-label="Filtrar status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">Todos os status</option>
          {Object.entries(statusLabels).map(([id, name]) => (
            <option value={id} key={id}>
              {name}
            </option>
          ))}
        </select>
      </header>
      {orders.length === 0 ? (
        <Empty title="Pronto para o primeiro pedido">
          <p>Os pedidos feitos pelo cardápio aparecem aqui.</p>
        </Empty>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Mesa</th>
                <th>Horário</th>
                <th>Valor</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders
                .filter((o) => filter === "all" || o.status === filter)
                .map((o) => (
                  <tr key={o.id}>
                    <td>#{String(o.number).padStart(4, "0")}</td>
                    <td>{o.tableName}</td>
                    <td>{new Date(o.createdAt).toLocaleString("pt-BR")}</td>
                    <td>{money(o.total)}</td>
                    <td>
                      <span className={`status-badge ${o.status}`}>
                        {statusLabels[o.status]}
                      </span>
                    </td>
                    <td>
                      <button
                        className="button secondary"
                        onClick={() => setOrder(o)}
                      >
                        Detalhes
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      {order && (
        <Modal label="Detalhes do pedido" onClose={() => setOrder(null)}>
          <div className="edit-form">
            <h2>Pedido #{order.number}</h2>
            <p>
              {order.tableName} · {statusLabels[order.status]}
            </p>
            {order.items.map((i, index) => (
              <div className="receipt-item" key={index}>
                <span>{i.quantity}×</span>
                <div>
                  <b>{i.name}</b>
                  <small>{i.modifiers.map((m) => m.name).join(", ")}</small>
                  <p>{i.notes}</p>
                </div>
                <strong>{money(i.total)}</strong>
              </div>
            ))}
            <div className="cart-total">
              <span>Total</span>
              <strong>{money(order.total)}</strong>
            </div>
            <h4>Histórico</h4>
            {order.history.map((h, i) => (
              <p key={i}>
                {statusLabels[h.status]} ·{" "}
                {new Date(h.at).toLocaleString("pt-BR")}
              </p>
            ))}
            <Link className="button primary" href="/cozinha">
              Gerenciar na cozinha <ArrowRight size={15} />
            </Link>
          </div>
        </Modal>
      )}
    </section>
  );
}
function StaffPanel({
  staff,
  save,
  busy,
}: {
  staff: Staff[];
  save: (a: string, d: unknown) => Promise<boolean>;
  busy: boolean;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [role, setRole] = useState<"admin" | "kitchen">("kitchen");
  return (
    <>
      <form
        className="inline-form admin-panel"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await save("staff", { email, password, role })) {
            setEmail("");
            setPassword("");
          }
        }}
      >
        <label>
          E-mail
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Senha inicial
          <input
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          Função
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
          >
            <option value="kitchen">Cozinha</option>
            <option value="admin">Administrador</option>
          </select>
        </label>
        <button disabled={busy} className="button primary">
          <Plus size={16} /> Adicionar
        </button>
      </form>
      <section className="admin-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Funcionário</th>
                <th>Função</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id}>
                  <td>{s.email}</td>
                  <td>{s.role === "admin" ? "Administrador" : "Cozinha"}</td>
                  <td>
                    <span
                      className={`status-badge ${s.active ? "confirmed" : "received"}`}
                    >
                      {s.active ? "Ativo" : "Desativado"}
                    </span>
                  </td>
                  <td>
                    <button
                      disabled={busy}
                      className="button secondary"
                      onClick={() =>
                        void save("staffActive", {
                          id: s.id,
                          active: !s.active,
                        })
                      }
                    >
                      {s.active ? "Desativar" : "Ativar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
function SettingsPanel({
  catalog,
  save,
  busy,
}: {
  catalog: Catalog;
  save: (a: string, d: unknown) => Promise<boolean>;
  busy: boolean;
}) {
  const [s, setS] = useState(catalog.settings);
  return (
    <form
      className="settings-form admin-panel"
      onSubmit={(e) => {
        e.preventDefault();
        void save("settings", s);
      }}
    >
      <h3>A identidade da sua casa</h3>
      <div className="form-grid">
        <label>
          Nome do restaurante
          <input
            required
            maxLength={60}
            value={s.name}
            onChange={(e) => setS({ ...s, name: e.target.value })}
          />
        </label>
        <label>
          Assinatura da marca (abaixo do nome)
          <input
            maxLength={60}
            value={s.brandSubtitle || ""}
            onChange={(e) => setS({ ...s, brandSubtitle: e.target.value })}
          />
        </label>
        <label>
          Frase da marca
          <input
            maxLength={150}
            value={s.tagline}
            onChange={(e) => setS({ ...s, tagline: e.target.value })}
          />
        </label>
        <label>
          Cor principal
          <input
            type="color"
            value={s.color}
            onChange={(e) => setS({ ...s, color: e.target.value })}
          />
        </label>
        <label>
          Tipografia
          <select
            value={s.font}
            onChange={(e) =>
              setS({ ...s, font: e.target.value as typeof s.font })
            }
          >
            <option value="serif">Editorial · serifada</option>
            <option value="sans">Contemporânea · sem serifa</option>
          </select>
        </label>
        <label>
          Endereço
          <input
            value={s.address}
            onChange={(e) => setS({ ...s, address: e.target.value })}
          />
        </label>
        <label>
          Horário de funcionamento
          <input
            value={s.hours}
            onChange={(e) => setS({ ...s, hours: e.target.value })}
          />
        </label>
        <label>
          URL do logo (opcional)
          <input
            value={s.logo}
            onChange={(e) => setS({ ...s, logo: e.target.value })}
            placeholder="https://… ou /uploads/…"
          />
        </label>
        <label>
          URL da imagem principal
          <input
            type="url"
            required
            value={s.heroImage}
            onChange={(e) => setS({ ...s, heroImage: e.target.value })}
          />
        </label>
        <label>
          Fuso horário
          <input
            required
            value={s.timezone}
            onChange={(e) => setS({ ...s, timezone: e.target.value })}
          />
        </label>
      </div>
      <label>
        Descrição
        <textarea
          value={s.description}
          onChange={(e) => setS({ ...s, description: e.target.value })}
        />
      </label>
      <h3>Do pedido até a cozinha</h3>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={s.open}
          onChange={(e) => setS({ ...s, open: e.target.checked })}
        />{" "}
        Aceitar novos pedidos
      </label>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={s.sendImmediately}
          onChange={(e) => setS({ ...s, sendImmediately: e.target.checked })}
        />{" "}
        Confirmar automaticamente e enviar à cozinha
      </label>
      <p className="fine-print">
        Quando desativado, a equipe precisa confirmar cada pedido recebido.
      </p>
      <h4>Formas de pagamento com a equipe</h4>
      {(["cashier", "table"] as const).map((p) => (
        <label className="checkbox-label" key={p}>
          <input
            type="checkbox"
            checked={s.payments.includes(p)}
            onChange={(e) =>
              setS({
                ...s,
                payments: e.target.checked
                  ? [...s.payments, p]
                  : s.payments.filter((x) => x !== p),
              })
            }
          />
          {p === "cashier" ? "Pagamento no caixa" : "Pagamento na mesa"}
        </label>
      ))}
      <p className="notice">
        Pagamento online depende de um provedor real, webhooks e conciliação.
        Nenhuma transação é simulada.
      </p>
      <button disabled={busy} className="button primary">
        <Save size={16} />
        {busy ? "Salvando…" : "Salvar configurações"}
      </button>
    </form>
  );
}
function ProductEditor({
  product,
  catalog,
  initialTab = "details",
  onClose,
  onSave,
}: {
  product: Product;
  catalog: Catalog;
  initialTab?: string;
  onClose: () => void;
  onSave: (p: Product) => Promise<boolean>;
}) {
  const [p, setP] = useState(structuredClone(product)),
    [verifiedUrl, setVerifiedUrl] = useState(product.modelUrl || ""),
    [price, setPrice] = useState((product.price / 100).toFixed(2)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [tab, setTab] = useState(initialTab);
  function groups(groups: ModifierGroup[]) {
    setP({ ...p, groups });
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (
      hasModel3d(p) &&
      p.modelUrl !== product.modelUrl &&
      verifiedUrl !== p.modelUrl
    ) {
      setError("Carregue e confira a prévia do novo modelo antes de publicar.");
      setTab("models");
      return;
    }
    const cents = Math.round(Number(price.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents < 0) {
      setError("Informe um preço válido.");
      return;
    }
    setBusy(true);
    try {
      if (!(await onSave({ ...p, price: cents })))
        setError(
          "Não foi possível salvar. Confira os dados e as mensagens do painel.",
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      wide
      label="Editar produto"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="edit-form product-editor" onSubmit={submit}>
        <div>
          <span className="eyebrow">OS DETALHES FAZEM O SABOR</span>
          <h2>{product.name || "Novo produto"}</h2>
        </div>
        <div className="editor-tabs">
          {[
            ["details", "Produto"],
            ["models", "Arquivos & 3D"],
            ["options", "Personalizações"],
          ].map(([id, label]) => (
            <button
              type="button"
              className={tab === id ? "selected" : ""}
              key={id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "details" && (
          <>
            <div className="form-grid">
              <label>
                Nome
                <input
                  required
                  maxLength={100}
                  value={p.name}
                  onChange={(e) => setP({ ...p, name: e.target.value })}
                />
              </label>
              <label>
                Categoria
                <select
                  value={p.categoryId}
                  onChange={(e) => setP({ ...p, categoryId: e.target.value })}
                >
                  {catalog.categories.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Preço (R$)
                <input
                  required
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </label>
              <label>
                Preparo estimado (min)
                <input
                  type="number"
                  min={1}
                  max={240}
                  value={p.prepMinutes}
                  onChange={(e) =>
                    setP({ ...p, prepMinutes: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Selo (opcional)
                <input
                  maxLength={60}
                  value={p.badge || ""}
                  onChange={(e) => setP({ ...p, badge: e.target.value })}
                />
              </label>
              <label>
                Alérgenos (separados por vírgula)
                <input
                  value={p.allergens.join(", ")}
                  onChange={(e) =>
                    setP({
                      ...p,
                      allergens: e.target.value.split(",").map((x) => x.trim()),
                    })
                  }
                />
              </label>
            </div>
            <label>
              Descrição
              <textarea
                maxLength={1000}
                value={p.description}
                onChange={(e) => setP({ ...p, description: e.target.value })}
              />
            </label>
            <label>
              Ingredientes
              <textarea
                maxLength={1000}
                value={p.ingredients}
                onChange={(e) => setP({ ...p, ingredients: e.target.value })}
              />
            </label>
            <div className="form-checks">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={p.available}
                  onChange={(e) => setP({ ...p, available: e.target.checked })}
                />{" "}
                Disponível
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={p.featured}
                  onChange={(e) => setP({ ...p, featured: e.target.checked })}
                />{" "}
                Em destaque
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={!!p.vegetarian}
                  onChange={(e) => setP({ ...p, vegetarian: e.target.checked })}
                />{" "}
                Vegetariano
              </label>
            </div>
          </>
        )}
        {tab === "models" && (
          <ProductMediaEditor
            product={p}
            onChange={setP}
            onBusy={setBusy}
            onVerified={setVerifiedUrl}
          />
        )}
        {tab === "options" && (
          <>
            <p className="muted">
              Crie tamanhos, variações e adicionais com grupos de seleção.
              Alterações não mudam os modelos ilustrativos.
            </p>
            {p.groups.map((g, gi) => (
              <fieldset className="group-editor" key={g.id}>
                <div className="form-grid">
                  <label>
                    Nome do grupo
                    <input
                      required
                      value={g.name}
                      onChange={(e) =>
                        groups(
                          p.groups.map((x, i) =>
                            i === gi ? { ...x, name: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <div className="form-grid">
                    <label>
                      Mínimo
                      <input
                        type="number"
                        min={0}
                        max={g.options.length}
                        value={g.min}
                        onChange={(e) =>
                          groups(
                            p.groups.map((x, i) =>
                              i === gi
                                ? { ...x, min: Number(e.target.value) }
                                : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Máximo
                      <input
                        type="number"
                        min={1}
                        max={Math.max(1, g.options.length)}
                        value={g.max}
                        onChange={(e) =>
                          groups(
                            p.groups.map((x, i) =>
                              i === gi
                                ? { ...x, max: Number(e.target.value) }
                                : x,
                            ),
                          )
                        }
                      />
                    </label>
                  </div>
                </div>
                {g.options.map((o, oi) => (
                  <div className="option-editor" key={o.id}>
                    <input
                      required
                      aria-label="Nome da opção"
                      value={o.name}
                      onChange={(e) =>
                        groups(
                          p.groups.map((x, i) =>
                            i === gi
                              ? {
                                  ...x,
                                  options: x.options.map((y, j) =>
                                    j === oi
                                      ? { ...y, name: e.target.value }
                                      : y,
                                  ),
                                }
                              : x,
                          ),
                        )
                      }
                    />
                    <label>
                      R$
                      <input
                        aria-label="Preço adicional"
                        type="number"
                        step="0.01"
                        min={0}
                        value={o.price / 100}
                        onChange={(e) =>
                          groups(
                            p.groups.map((x, i) =>
                              i === gi
                                ? {
                                    ...x,
                                    options: x.options.map((y, j) =>
                                      j === oi
                                        ? {
                                            ...y,
                                            price: Math.round(
                                              Number(e.target.value) * 100,
                                            ),
                                          }
                                        : y,
                                    ),
                                  }
                                : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Remover opção"
                      onClick={() =>
                        groups(
                          p.groups.map((x, i) =>
                            i === gi
                              ? {
                                  ...x,
                                  options: x.options.filter((_, j) => j !== oi),
                                }
                              : x,
                          ),
                        )
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                <div className="group-editor-buttons">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() =>
                      groups(
                        p.groups.map((x, i) =>
                          i === gi
                            ? {
                                ...x,
                                options: [
                                  ...x.options,
                                  {
                                    id: createClientId(),
                                    name: "Nova opção",
                                    price: 0,
                                  },
                                ],
                              }
                            : x,
                        ),
                      )
                    }
                  >
                    <Plus size={14} /> Opção
                  </button>
                  <button
                    type="button"
                    className="text-link danger"
                    onClick={() => groups(p.groups.filter((_, i) => i !== gi))}
                  >
                    Excluir grupo
                  </button>
                </div>
              </fieldset>
            ))}
            <button
              type="button"
              className="button secondary"
              onClick={() =>
                groups([
                  ...p.groups,
                  {
                    id: createClientId(),
                    name: "Novo grupo",
                    min: 0,
                    max: 1,
                    options: [
                      { id: createClientId(), name: "Nova opção", price: 0 },
                    ],
                  },
                ])
              }
            >
              <Plus size={16} /> Novo grupo
            </button>
          </>
        )}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <div className="editor-footer">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? <Spinner /> : <Save size={16} />} Salvar produto
          </button>
        </div>
      </form>
    </Modal>
  );
}
