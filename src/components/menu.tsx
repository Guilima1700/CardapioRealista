"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowLeft,
  Plus,
  Minus,
  ShoppingBag,
  Search,
  SlidersHorizontal,
  Flame,
  Box,
  Clock,
  MapPin,
  Leaf,
  Check,
  ChevronRight,
  UtensilsCrossed,
  GlassWater,
  IceCreamBowl,
  Sandwich,
  Heart,
  Rotate3D,
  Trash2,
  CheckCircle2,
  AlertCircle,
  QrCode,
} from "lucide-react";
import { api, track } from "@/lib/client";
import { createClientId } from "@/lib/client-id";
import {
  readStored,
  readStoredJSON,
  writeStored,
  removeStored,
} from "@/lib/browser-storage";
import { hasModel3d } from "@/lib/product-media";
import {
  money,
  type Catalog,
  type Product,
  type CartLine,
  type Table,
  type Order,
} from "@/lib/types";
import { Brand, Modal, Empty, Spinner } from "./ui";
const ModelViewer = dynamic(() => import("./model-viewer"), {
  ssr: false,
  loading: () => <div className="viewer-loading">Carregando visualizador…</div>,
});
type StoredLine = CartLine & { key: string };
const icons: Record<string, typeof Flame> = {
  burger: Sandwich,
  fries: UtensilsCrossed,
  combo: Flame,
  drink: GlassWater,
  sweet: IceCreamBowl,
};
function linePrice(line: CartLine, products: Product[]) {
  const p = products.find((p) => p.id === line.productId);
  return p
    ? (p.price +
        p.groups
          .flatMap((g) => g.options)
          .filter((o) => line.modifierIds.includes(o.id))
          .reduce((s, o) => s + o.price, 0)) *
        line.quantity
    : 0;
}
export default function Menu({
  initial,
  table,
  demo,
}: {
  initial: Catalog;
  table?: Table;
  demo: boolean;
}) {
  const router = useRouter();
  const [catalog, setCatalog] = useState(initial),
    [category, setCategory] = useState("burgers"),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState<"all" | "vegetarian" | "3d">("all"),
    [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null),
    [modelMode, setModelMode] = useState(false),
    [cart, setCart] = useState<StoredLine[]>([]),
    [cartOpen, setCartOpen] = useState(false),
    [payment, setPayment] = useState<"cashier" | "table">(
      initial.settings.payments[0],
    ),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [info, setInfo] = useState(false),
    [favorites, setFavorites] = useState<string[]>([]),
    [onlyFavorites, setOnlyFavorites] = useState(false);
  const [hydrated, setHydrated] = useState(false),
    [lastOrder, setLastOrder] = useState<string | null>(null),
    [storageAvailable, setStorageAvailable] = useState(true);
  const checkoutRetry = useRef<{ fingerprint: string; key: string } | null>(
    null,
  );
  const cartKey = `brasa_cart_${table?.token || "browse"}`;
  useEffect(() => {
    try {
      const saved = readStoredJSON(cartKey);
      if (Array.isArray(saved))
        setCart(
          saved
            .filter(
              (x) =>
                x &&
                typeof x.productId === "string" &&
                Number.isInteger(x.quantity) &&
                x.quantity > 0 &&
                x.quantity <= 20 &&
                Array.isArray(x.modifierIds) &&
                x.modifierIds.every((id: unknown) => typeof id === "string") &&
                typeof x.notes === "string" &&
                typeof x.key === "string",
            )
            .slice(0, 30),
        );
      const favorites = readStoredJSON("brasa_favorites");
      setFavorites(
        Array.isArray(favorites)
          ? favorites
              .filter((id): id is string => typeof id === "string")
              .slice(0, 100)
          : [],
      );
      setLastOrder(readStored(`brasa_last_${table?.token}`));
    } catch {}
    setHydrated(true);
  }, [cartKey, table?.token]);
  useEffect(() => {
    if (hydrated)
      setStorageAvailable(writeStored(cartKey, JSON.stringify(cart)));
  }, [cart, cartKey, hydrated]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const next = await api<Catalog>(
          `/api/catalog?mesa=${encodeURIComponent(table?.token || "")}`,
        );
        if (active) setCatalog(next);
      } catch {}
    }
    const timer = setInterval(refresh, 30000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [table?.token]);
  const products = useMemo(
    () =>
      catalog.products
        .filter(
          (p) =>
            (search
              ? `${p.name} ${p.description} ${p.ingredients}`
                  .toLowerCase()
                  .includes(search.toLowerCase())
              : p.categoryId === category) &&
            (filter !== "vegetarian" || p.vegetarian) &&
            (filter !== "3d" || hasModel3d(p)) &&
            (!onlyFavorites || favorites.includes(p.id)),
        )
        .sort((a, b) => Number(b.featured) - Number(a.featured)),
    [catalog.products, category, search, filter, onlyFavorites, favorites],
  );
  const total = cart.reduce(
      (s, line) => s + linePrice(line, catalog.products),
      0,
    ),
    count = cart.reduce((s, line) => s + line.quantity, 0);
  const settings = catalog.settings;
  function open(p: Product, model = false) {
    setSelected(p);
    setModelMode(model);
    track("product_view", p.id);
  }
  function favorite(id: string) {
    const next = favorites.includes(id)
      ? favorites.filter((x) => x !== id)
      : [...favorites, id];
    setFavorites(next);
    writeStored("brasa_favorites", JSON.stringify(next));
  }
  function add(line: CartLine) {
    setCart((old) => [...old, { ...line, key: createClientId() }]);
    setSelected(null);
    track("add_to_cart", line.productId);
    setToast("Boa escolha! Adicionado ao seu pedido.");
  }
  async function checkout() {
    if (!table) {
      setError("Escaneie o QR Code da sua mesa para pedir.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const fingerprint = JSON.stringify({
        cart: cart.map(({ key, ...line }) => line),
        payment,
        tableToken: table.token,
      });
      const storedRetry = readStoredJSON("brasa_checkout") as {
        fingerprint?: unknown;
        key?: unknown;
      } | null;
      let retry = checkoutRetry.current;
      if (
        storedRetry?.fingerprint === fingerprint &&
        typeof storedRetry.key === "string" &&
        /^[a-f0-9-]{36}$/.test(storedRetry.key)
      )
        retry = { fingerprint, key: storedRetry.key };
      const key =
        retry?.fingerprint === fingerprint ? retry.key : createClientId();
      checkoutRetry.current = { fingerprint, key };
      writeStored("brasa_checkout", JSON.stringify({ fingerprint, key }));
      const order = await api<Order>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          tableToken: table.token,
          idempotencyKey: key,
          payment,
          items: cart.map(({ key, ...line }) => line),
        }),
      });
      writeStored(`brasa_last_${table.token}`, order.trackingToken);
      removeStored("brasa_checkout");
      removeStored(cartKey);
      checkoutRetry.current = null;
      setLastOrder(order.trackingToken);
      router.push(`/pedido/${encodeURIComponent(order.trackingToken)}`);
    } catch (e) {
      setError((e as Error).message);
      setPending(false);
    }
  }
  return (
    <div
      className="customer-app"
      style={
        {
          "--accent": settings.color,
          "--display-font":
            settings.font === "sans"
              ? "Arial, sans-serif"
              : "Georgia, 'Times New Roman', serif",
        } as React.CSSProperties
      }
    >
      <header className="site-header">
        <div className="header-inner">
          <Brand
            name={settings.name}
            logo={settings.logo}
            subtitle={settings.brandSubtitle}
          />
          <nav className="main-nav" aria-label="Navegação principal">
            <a className="active" href="#cardapio">
              Cardápio
              <span />
            </a>
            <button disabled={!hydrated} onClick={() => setInfo(true)}>
              A experiência 3D <Box size={13} />
            </button>
            <button
              disabled={!hydrated}
              onClick={() =>
                lastOrder
                  ? router.push(`/pedido/${encodeURIComponent(lastOrder)}`)
                  : setToast("Seus pedidos aparecerão aqui após a confirmação.")
              }
            >
              Meus pedidos
            </button>
          </nav>
          <div className="header-actions">
            <span className="open-pill">
              <i />
              {settings.open ? "A casa está aberta" : "Pedidos pausados"}
            </span>
            <button
              disabled={!hydrated}
              className="table-pill"
              onClick={() => setInfo(true)}
            >
              <QrCode size={16} />
              {table?.name || "Escolha sua mesa"}
            </button>
            <button
              disabled={!hydrated}
              className="bag-button"
              aria-label={`Abrir sacola, ${count} itens`}
              onClick={() => setCartOpen(true)}
            >
              <ShoppingBag size={20} />
              {count > 0 && <b>{count}</b>}
            </button>
          </div>
        </div>
      </header>
      <main className="menu-shell">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span /> ARTESANAL. AUTÊNTICO. NA BRASA.
            </div>
            <h1>
              Seu próximo
              <br />
              favorito está <br />
              <em>na brasa.</em>
              <span className="hero-spark">✳</span>
            </h1>
            <p>
              {settings.description}
              <br />
              Escolha, personalize e deixe o resto com a gente.
            </p>
            <a className="button primary" href="#cardapio">
              Encontre seu favorito <ArrowUpRight size={18} />
            </a>
            <div className="hero-meta">
              <span>
                <Clock size={15} /> Preparo com cuidado
              </span>
              <span className="meta-dot">·</span>
              <span>
                <Flame size={16} /> Sabor de verdade
              </span>
            </div>
          </div>
          <div className="hero-image">
            <img
              src={settings.heroImage}
              alt="Hambúrguer artesanal preparado na brasa"
              fetchPriority="high"
            />
            <div className="hero-image-shade" />
            <div className="image-top">
              <span className="handwritten">feito com fogo & alma</span>
              <span className="round-stamp">
                100%<small>ARTESANAL</small>
              </span>
            </div>
            <div className="image-caption">
              <div>
                <span>O RITUAL COMEÇA AQUI</span>
                <h2>
                  Tem sabor.
                  <br />
                  Tem {settings.name}.
                </h2>
              </div>
              <span className="image-arrow">
                <ArrowUpRight size={25} />
              </span>
            </div>
            <div className="hero-image-note">
              <Flame size={16} />
              <span>BLEND DA CASA · FOGO DE VERDADE</span>
            </div>
          </div>
        </section>
        <section className="experience-banner">
          <div className="cube-icon">
            <Box size={27} strokeWidth={1.3} />
          </div>
          <div>
            <h3>O sabor começa com os olhos.</h3>
            <p>
              Explore seu burger em 3D e, em aparelhos compatíveis, veja ele na
              sua mesa.
            </p>
          </div>
          <button
            disabled={!hydrated}
            onClick={() => {
              const p = catalog.products.find(hasModel3d);
              p ? open(p, true) : setInfo(true);
            }}
          >
            Viva a experiência <ArrowRight size={17} />
          </button>
          <span className="banner-3d">3D</span>
        </section>
        <section id="cardapio" className="menu-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">ESCOLHA O SEU MOMENTO</span>
              <h2>
                Nosso cardápio<span>.</span>
              </h2>
            </div>
            <div className="menu-tools">
              <label className="search-input">
                <Search size={17} />
                <input
                  disabled={!hydrated}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="O que você está com vontade?"
                  aria-label="Pesquisar no cardápio"
                />
              </label>
              <button
                disabled={!hydrated}
                className={`icon-button filter-button ${showFilters ? "active" : ""}`}
                aria-label="Filtrar produtos"
                onClick={() => setShowFilters(!showFilters)}
              >
                <SlidersHorizontal size={19} />
              </button>
            </div>
          </div>
          {showFilters && (
            <div className="filters">
              <span>Mostrar:</span>
              {(
                [
                  ["all", "Todos"],
                  ["vegetarian", "Vegetarianos"],
                  ["3d", "Com modelo 3D"],
                ] as const
              ).map(([key, label]) => (
                <button
                  disabled={!hydrated}
                  key={key}
                  className={filter === key ? "selected" : ""}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ))}
              <button
                disabled={!hydrated}
                className={onlyFavorites ? "selected" : ""}
                onClick={() => setOnlyFavorites(!onlyFavorites)}
              >
                <Heart size={14} /> Favoritos
              </button>
            </div>
          )}
          <div className="category-bar" role="tablist" aria-label="Categorias">
            {catalog.categories.map((c) => {
              const Icon = icons[c.icon] || UtensilsCrossed;
              return (
                <button
                  disabled={!hydrated}
                  key={c.id}
                  role="tab"
                  aria-selected={category === c.id}
                  className={category === c.id ? "selected" : ""}
                  onClick={() => {
                    setCategory(c.id);
                    setSearch("");
                    track("category_view", undefined, c.id);
                  }}
                >
                  <Icon size={19} />
                  {c.name}
                  <span>
                    {
                      catalog.products.filter((p) => p.categoryId === c.id)
                        .length
                    }
                  </span>
                </button>
              );
            })}
          </div>
          <div className="products-heading">
            <h3>
              {search
                ? "Resultados da sua busca"
                : catalog.categories.find((c) => c.id === category)?.name}
              <span>{products.length} opções para você</span>
            </h3>
            <span className="made-with">
              <Flame size={14} /> Cada detalhe faz a diferença.
            </span>
          </div>
          {products.length === 0 ? (
            <Empty title="Ainda não encontramos esse sabor">
              <p>Tente outra busca ou ajuste os filtros.</p>
              <button
                disabled={!hydrated}
                className="button secondary"
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                  setOnlyFavorites(false);
                }}
              >
                Limpar filtros
              </button>
            </Empty>
          ) : (
            <div className="product-grid">
              {products.map((p) => (
                <article className="product-card" key={p.id}>
                  <div className="product-photo">
                    <button
                      disabled={!hydrated}
                      className="photo-open"
                      onClick={() => open(p)}
                      aria-label={`Ver ${p.name}`}
                    >
                      <img src={p.image} alt={p.name} loading="lazy" />
                    </button>
                    {(p.badge || p.featured) && (
                      <span
                        className={`product-badge ${p.vegetarian ? "green" : ""}`}
                      >
                        {p.vegetarian ? (
                          <Leaf size={12} />
                        ) : (
                          <Flame size={12} />
                        )}{" "}
                        {p.badge || "Destaque da casa"}
                      </span>
                    )}
                    <button
                      disabled={!hydrated}
                      className={`favorite-button ${favorites.includes(p.id) ? "saved" : ""}`}
                      onClick={() => favorite(p.id)}
                      aria-label={`${favorites.includes(p.id) ? "Remover" : "Salvar"} ${p.name} nos favoritos`}
                    >
                      <Heart
                        size={17}
                        fill={
                          favorites.includes(p.id) ? "currentColor" : "none"
                        }
                      />
                    </button>
                    {hasModel3d(p) && (
                      <button
                        disabled={!hydrated}
                        className="model-pill"
                        onClick={() => open(p, true)}
                      >
                        <Box size={14} /> Explorar em 3D{" "}
                        <ArrowUpRight size={12} />
                      </button>
                    )}
                  </div>
                  <div className="product-copy">
                    <div className="product-title">
                      <button disabled={!hydrated} onClick={() => open(p)}>
                        {p.name}
                      </button>
                      <span>
                        <Clock size={12} />
                        {p.prepMinutes} min
                      </span>
                    </div>
                    <p>{p.description}</p>
                    <div className="product-bottom">
                      <div>
                        <small>A PARTIR DE</small>
                        <strong>{money(p.price)}</strong>
                      </div>
                      <button
                        disabled={!hydrated}
                        className="add-button"
                        aria-label={`Personalizar ${p.name}`}
                        onClick={() => open(p)}
                      >
                        <Plus size={20} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          <div className="menu-footnote">
            <Leaf size={16} />
            <p>
              Feito na hora, com ingredientes de verdade.
              <span>
                {" "}
                Alergias ou restrições? Consulte os ingredientes e fale com
                nossa equipe.
              </span>
            </p>
          </div>
        </section>
        <section className="closing-note">
          <Flame size={28} />
          <p>
            Mais do que um burger.
            <br />
            <em>Um bom motivo para estar aqui.</em>
          </p>
          <span>{settings.tagline}</span>
        </section>
      </main>
      <footer className="site-footer">
        <div>
          <Brand
            name={settings.name}
            logo={settings.logo}
            subtitle={settings.brandSubtitle}
            small
          />
          <span>{settings.address}</span>
        </div>
        <div>
          <span>{settings.hours}</span>
          <Link href="/equipe">
            Área da equipe <ArrowUpRight size={13} />
          </Link>
        </div>
      </footer>
      {demo && (
        <div className="demo-note">
          Demonstração · {table?.name} ·{" "}
          <Link href="/equipe">
            Abrir cozinha e gestão <ArrowUpRight size={11} />
          </Link>
        </div>
      )}
      {count > 0 && !cartOpen && (
        <button
          disabled={!hydrated}
          className="floating-cart"
          onClick={() => setCartOpen(true)}
        >
          <span>
            <ShoppingBag size={19} />
            <b>{count}</b>
          </span>
          Ver meu pedido<strong>{money(total)}</strong>
          <ArrowRight size={18} />
        </button>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      {selected && (
        <ProductDialog
          key={selected.id}
          product={selected}
          startModel={modelMode}
          onClose={() => setSelected(null)}
          onAdd={add}
        />
      )}
      {cartOpen && (
        <Modal
          label="Revisar pedido"
          onClose={() => {
            if (!pending) setCartOpen(false);
          }}
        >
          <div className="cart-dialog">
            {!storageAvailable && (
              <p className="notice" role="status">
                Seu navegador não permite salvar a sacola. Mantenha esta página
                aberta até confirmar o pedido.
              </p>
            )}
            <span className="eyebrow">SUA ESCOLHA, SEU MOMENTO</span>
            <h2>
              Seu pedido<span>.</span>
            </h2>
            <p className="muted">
              <MapPin size={15} />
              {table?.name || "Escaneie o QR Code da sua mesa"}
            </p>
            {cart.length === 0 ? (
              <Empty title="Sua sacola está esperando">
                <p>Que tal começar pelo seu burger favorito?</p>
                <button
                  disabled={!hydrated}
                  className="button primary"
                  onClick={() => setCartOpen(false)}
                >
                  Explorar o cardápio <ArrowRight size={16} />
                </button>
              </Empty>
            ) : (
              <>
                {cart.map((line) => {
                  const p = catalog.products.find(
                    (p) => p.id === line.productId,
                  );
                  return (
                    <div className="cart-line" key={line.key}>
                      {p && <img src={p.image} alt="" />}
                      <div>
                        <h4>{p?.name || "Produto indisponível"}</h4>
                        <small>
                          {p?.groups
                            .flatMap((g) => g.options)
                            .filter((o) => line.modifierIds.includes(o.id))
                            .map((o) => o.name)
                            .join(" · ")}
                        </small>
                        {line.notes && <p>Obs.: {line.notes}</p>}
                        <div className="cart-line-bottom">
                          <div className="quantity small">
                            <button
                              disabled={pending || line.quantity <= 1}
                              aria-label="Diminuir quantidade"
                              onClick={() =>
                                setCart((c) =>
                                  c.map((l) =>
                                    l.key === line.key
                                      ? {
                                          ...l,
                                          quantity: Math.max(1, l.quantity - 1),
                                        }
                                      : l,
                                  ),
                                )
                              }
                            >
                              <Minus size={13} />
                            </button>
                            <span>{line.quantity}</span>
                            <button
                              disabled={pending || line.quantity >= 20}
                              aria-label="Aumentar quantidade"
                              onClick={() =>
                                setCart((c) =>
                                  c.map((l) =>
                                    l.key === line.key
                                      ? { ...l, quantity: l.quantity + 1 }
                                      : l,
                                  ),
                                )
                              }
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                          <b>{money(linePrice(line, catalog.products))}</b>
                          <button
                            disabled={pending}
                            className="icon-button"
                            aria-label={`Remover ${p?.name || "item"}`}
                            onClick={() =>
                              setCart((c) =>
                                c.filter((l) => l.key !== line.key),
                              )
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className="payment-options">
                  <h4>Como prefere pagar?</h4>
                  {settings.payments.map((p) => (
                    <label key={p}>
                      <input
                        type="radio"
                        name="payment"
                        value={p}
                        checked={payment === p}
                        disabled={pending}
                        onChange={() => setPayment(p)}
                      />
                      <span>
                        {p === "cashier" ? "No caixa" : "Na mesa"}
                        <small>
                          {p === "cashier"
                            ? "Acerte com a equipe ao finalizar."
                            : "A equipe leva a conta até você."}
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
                <div className="cart-total">
                  <span>Total do pedido</span>
                  <strong>{money(total)}</strong>
                </div>
                <p className="fine-print">
                  Confira as opções e observações. O pagamento será feito com a
                  equipe. Nenhuma cobrança é realizada aqui.
                </p>
                {error && (
                  <p className="notice error" role="alert">
                    {error}
                  </p>
                )}
                <button
                  className="button primary full"
                  disabled={pending || !table || !settings.open}
                  onClick={checkout}
                >
                  {pending ? <Spinner /> : <Check size={18} />}{" "}
                  {pending
                    ? "Enviando seu pedido…"
                    : "Confirmar e enviar pedido"}{" "}
                  {!pending && <ArrowRight size={18} />}
                </button>
                {!table && (
                  <p className="notice">
                    Para pedir, acesse o cardápio pelo QR Code da sua mesa.
                  </p>
                )}
              </>
            )}
          </div>
        </Modal>
      )}
      {info && (
        <Modal
          label={`A experiência ${settings.name}`}
          onClose={() => setInfo(false)}
        >
          <div className="info-dialog">
            <span className="cube-icon">
              <Rotate3D size={30} />
            </span>
            <h2>
              Uma nova forma
              <br />
              de escolher.
            </h2>
            <p>
              Abra um produto com o selo 3D para girar, ampliar e explorar. Em
              celulares compatíveis, o botão “Ver na minha mesa” inicia a
              realidade aumentada.
            </p>
            <p className="notice">
              Os modelos da demonstração são ilustrações geométricas. O visual
              não muda com os adicionais. AR precisa de HTTPS e aparelho
              compatível.
            </p>
            <div className="info-table">
              <QrCode size={23} />
              <div>
                <b>{table?.name || "Navegando sem mesa"}</b>
                <p>
                  {table
                    ? "Seu pedido será enviado para esta mesa."
                    : "Escaneie o QR Code na sua mesa para fazer pedidos."}
                </p>
              </div>
            </div>
            <button
              disabled={!hydrated}
              className="button primary full"
              onClick={() => {
                setInfo(false);
                const p = catalog.products.find(hasModel3d);
                if (p) open(p, true);
              }}
            >
              Explorar um produto <ArrowRight size={17} />
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function ProductDialog({
  product: p,
  startModel,
  onClose,
  onAdd,
}: {
  product: Product;
  startModel: boolean;
  onClose: () => void;
  onAdd: (line: CartLine) => void;
}) {
  const [model, setModel] = useState(hasModel3d(p)),
    [ids, setIds] = useState<string[]>(
      p.groups.flatMap((g) => g.options.slice(0, g.min).map((o) => o.id)),
    ),
    [qty, setQty] = useState(1),
    [notes, setNotes] = useState(""),
    [error, setError] = useState("");
  const unit =
    p.price +
    p.groups
      .flatMap((g) => g.options)
      .filter((o) => ids.includes(o.id))
      .reduce((s, o) => s + o.price, 0);
  function toggle(group: Product["groups"][number], id: string) {
    if (group.max === 1)
      setIds((old) => [
        ...old.filter((x) => !group.options.some((o) => o.id === x)),
        ...(ids.includes(id) && group.min === 0 ? [] : [id]),
      ]);
    else if (ids.includes(id)) setIds((old) => old.filter((x) => x !== id));
    else if (group.options.filter((o) => ids.includes(o.id)).length < group.max)
      setIds((old) => [...old, id]);
    else setError(`Escolha até ${group.max} opções em ${group.name}.`);
  }
  function add() {
    const invalid = p.groups.find((g) => {
      const count = g.options.filter((o) => ids.includes(o.id)).length;
      return count < g.min || count > g.max;
    });
    if (invalid) {
      setError(`Revise a seleção: ${invalid.name}.`);
      return;
    }
    onAdd({ productId: p.id, quantity: qty, modifierIds: ids, notes });
  }
  return (
    <Modal label={`Personalizar ${p.name}`} onClose={onClose} wide>
      <div className="product-dialog">
        <div className="product-visual">
          <div className="visual-tabs">
            <button
              className={!model ? "selected" : ""}
              onClick={() => setModel(false)}
            >
              Fotografia
            </button>
            {hasModel3d(p) && (
              <button
                className={model ? "selected" : ""}
                onClick={() => setModel(true)}
              >
                <Box size={15} /> Modelo 3D
              </button>
            )}
          </div>
          {model ? (
            <ModelViewer product={p} />
          ) : (
            <>
              <img className="detail-image" src={p.image} alt={p.name} />
              {hasModel3d(p) && (
                <button
                  className="button secondary model-cta"
                  onClick={() => setModel(true)}
                >
                  <Rotate3D size={20} /> Conheça cada ângulo{" "}
                  <ArrowUpRight size={17} />
                </button>
              )}
            </>
          )}
          <div className="ingredient-note">
            <Leaf size={16} />
            <div>
              <b>Ingredientes de verdade</b>
              <p>{p.ingredients}</p>
            </div>
          </div>
        </div>
        <div className="product-options">
          <span className="eyebrow">FEITO NA HORA, DO SEU JEITO</span>
          <h2>
            {p.name}
            <span>.</span>
          </h2>
          <p className="detail-description">{p.description}</p>
          <div className="detail-meta">
            <span>
              <Clock size={14} /> Cerca de {p.prepMinutes} min
            </span>
            <strong>{money(p.price)}</strong>
          </div>
          {p.allergens.length > 0 && (
            <p className="allergen-note">
              <AlertCircle size={15} />
              <span>
                Contém: {p.allergens.join(", ")}. Informe restrições à equipe;
                não garantimos ausência de contaminação cruzada.
              </span>
            </p>
          )}
          {p.groups.map((g) => (
            <fieldset className="modifier-group" key={g.id}>
              <legend>
                {g.name}
                <small>
                  {g.min > 0 ? "Obrigatório" : "Opcional"} ·{" "}
                  {g.max === 1 ? "escolha 1" : `até ${g.max}`}
                </small>
              </legend>
              {g.options.map((o) => (
                <label
                  key={o.id}
                  className={ids.includes(o.id) ? "checked" : ""}
                >
                  <input
                    type={g.max === 1 ? "radio" : "checkbox"}
                    name={g.id}
                    checked={ids.includes(o.id)}
                    onChange={() => {
                      setError("");
                      toggle(g, o.id);
                    }}
                  />
                  <span>{o.name}</span>
                  <small>{o.price ? `+ ${money(o.price)}` : "Incluso"}</small>
                </label>
              ))}
            </fieldset>
          ))}
          <label className="notes-label">
            Alguma observação?
            <textarea
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: sem tomate, molho à parte…"
              rows={2}
            />
            <small>{notes.length}/500</small>
          </label>
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
          <div className="product-add-footer">
            <div className="quantity">
              <button
                aria-label="Diminuir quantidade"
                disabled={qty <= 1}
                onClick={() => setQty(qty - 1)}
              >
                <Minus size={16} />
              </button>
              <span>{qty}</span>
              <button
                aria-label="Aumentar quantidade"
                disabled={qty >= 20}
                onClick={() => setQty(qty + 1)}
              >
                <Plus size={16} />
              </button>
            </div>
            <button className="button primary" onClick={add}>
              Adicionar <span>{money(unit * qty)}</span>
              <Plus size={17} />
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
