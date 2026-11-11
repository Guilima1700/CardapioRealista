import "server-only";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { seed } from "../seed";
import { migrateExperiences } from "./experience-sqlite";
import {
  AppError,
  assertTransition,
  priceCart,
  type checkoutSchema,
} from "../validation";
import type { z } from "zod";
import type {
  AnalyticsEvent,
  Catalog,
  Order,
  Product,
  Staff,
  Status,
  Settings,
  Category,
  Table,
} from "../types";

export const backend =
  process.env.DATA_BACKEND === "supabase" ? "supabase" : "sqlite";
let sqlite: DatabaseSync | undefined;
let service: SupabaseClient | undefined;
export function supabase() {
  if (!service) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
      key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key)
      throw new AppError(
        "Configure as credenciais do Supabase no servidor.",
        503,
      );
    service = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return service;
}
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function localDb() {
  if (sqlite) return sqlite;
  const dir = path.resolve(process.env.DATA_DIR || "./data");
  mkdirSync(dir, { recursive: true });
  sqlite = new DatabaseSync(path.join(dir, "brasa.sqlite"));
  sqlite.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS restaurant_settings (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS menu_categories (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS menu_items (id TEXT PRIMARY KEY, category_id TEXT NOT NULL REFERENCES menu_categories(id), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS restaurant_tables (id TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, number INTEGER UNIQUE NOT NULL, tracking_token TEXT UNIQUE NOT NULL, idempotency_key TEXT UNIQUE NOT NULL, table_id TEXT NOT NULL REFERENCES restaurant_tables(id), status TEXT NOT NULL CHECK(status IN ('received','confirmed','preparing','ready','delivered')), version INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS orders_created_idx ON orders(created_at);
    CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status);
    CREATE TABLE IF NOT EXISTS order_items (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS order_status_history (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), status TEXT NOT NULL, at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS staff_users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, role TEXT CHECK(role IN ('admin','kitchen')) NOT NULL, active INTEGER NOT NULL DEFAULT 1, password_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS analytics_events (id TEXT PRIMARY KEY, type TEXT NOT NULL, product_id TEXT, category_id TEXT, session_id TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS analytics_date_idx ON analytics_events(created_at);
    CREATE TABLE IF NOT EXISTS product_assets (id TEXT PRIMARY KEY, product_id TEXT REFERENCES menu_items(id), url TEXT NOT NULL, kind TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS integration_outbox (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), version INTEGER NOT NULL, event_type TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, processed_at TEXT, attempts INTEGER NOT NULL DEFAULT 0, UNIQUE(order_id,version));
    CREATE INDEX IF NOT EXISTS outbox_pending_idx ON integration_outbox(processed_at,created_at);
  `);
  migrateExperiences(sqlite);
  if (!sqlite.prepare("SELECT id FROM restaurant_settings WHERE id=1").get()) {
    sqlite.exec("BEGIN IMMEDIATE");
    try {
      sqlite
        .prepare("INSERT INTO restaurant_settings VALUES (1,?)")
        .run(JSON.stringify(seed.settings));
      const cat = sqlite.prepare("INSERT INTO menu_categories VALUES (?,?)");
      seed.categories.forEach((c) => cat.run(c.id, JSON.stringify(c)));
      const item = sqlite.prepare("INSERT INTO menu_items VALUES (?,?,?)");
      seed.products.forEach((p) =>
        item.run(p.id, p.categoryId, JSON.stringify(p)),
      );
      const table = sqlite.prepare(
        "INSERT INTO restaurant_tables VALUES (?,?,?)",
      );
      seed.tables.forEach((t) => table.run(t.id, t.token, JSON.stringify(t)));
      const password =
        process.env.DEMO_ADMIN_PASSWORD ||
        (process.env.NODE_ENV !== "production" ? "Demo@2026!" : "");
      if (!password)
        throw new Error(
          "Defina DEMO_ADMIN_PASSWORD antes de inicializar SQLite em produção.",
        );
      sqlite
        .prepare("INSERT INTO staff_users VALUES (?,?,?,?,?)")
        .run(
          randomUUID(),
          process.env.DEMO_ADMIN_EMAIL || "admin@brasa.local",
          "admin",
          1,
          hashPassword(password),
        );
      sqlite.exec("COMMIT");
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  }
  return sqlite;
}
function parseRow<T>(row: unknown): T {
  return JSON.parse((row as { data: string }).data) as T;
}
function dbError(error: { message: string } | null) {
  if (error) {
    console.error("Database operation failed:", error.message);
    throw new AppError(
      "Não foi possível concluir a operação. Atualize e tente novamente.",
      503,
    );
  }
}
export async function getCatalog(): Promise<Catalog> {
  if (backend === "sqlite") {
    return getLocalCatalog();
  }
  const results = await Promise.all([
    supabase().from("restaurant_settings").select("data").eq("id", 1).single(),
    supabase().from("menu_categories").select("data"),
    supabase().from("menu_items").select("data"),
    supabase().from("restaurant_tables").select("data"),
  ]);
  results.forEach((r) => dbError(r.error));
  return {
    backend,
    settings: { ...seed.settings, ...results[0].data!.data },
    categories: (results[1].data as { data: Category }[])
      .map((x) => x.data)
      .sort((a, b) => a.position - b.position),
    products: (results[2].data as { data: Product }[]).map((x) => x.data),
    tables: (results[3].data as { data: Table }[]).map((x) => x.data),
  };
}
function getLocalCatalog(): Catalog {
  const db = localDb();
  return {
    backend: "sqlite",
    settings: {
      ...seed.settings,
      ...parseRow<Settings>(
        db.prepare("SELECT data FROM restaurant_settings WHERE id=1").get(),
      ),
    },
    categories: db
      .prepare("SELECT data FROM menu_categories")
      .all()
      .map(parseRow<Category>)
      .sort((a, b) => a.position - b.position),
    products: db
      .prepare("SELECT data FROM menu_items")
      .all()
      .map(parseRow<Product>),
    tables: db
      .prepare("SELECT data FROM restaurant_tables")
      .all()
      .map(parseRow<Table>),
  };
}
export async function listOrders(): Promise<Order[]> {
  if (backend === "sqlite")
    return localDb()
      .prepare("SELECT data FROM orders ORDER BY created_at DESC LIMIT 2000")
      .all()
      .map(parseRow<Order>);
  const { data, error } = await supabase()
    .from("orders")
    .select("data")
    .order("created_at", { ascending: false })
    .limit(2000);
  dbError(error);
  return (data || []).map((x) => x.data);
}
export async function findOrder(token: string): Promise<Order | undefined> {
  if (backend === "sqlite") {
    const row = localDb()
      .prepare("SELECT data FROM orders WHERE tracking_token=?")
      .get(token);
    return row ? parseRow<Order>(row) : undefined;
  }
  const { data, error } = await supabase()
    .from("orders")
    .select("data")
    .eq("tracking_token", token)
    .maybeSingle();
  dbError(error);
  return data?.data;
}
export async function createOrder(
  input: z.infer<typeof checkoutSchema>,
  insideTransaction = false,
): Promise<Order> {
  if (backend === "supabase") {
    const { data, error } = await supabase().rpc("place_order", {
      p_request: input,
    });
    if (error)
      throw new AppError(
        error.message.includes("APP:")
          ? error.message.split("APP:")[1]
          : "Não foi possível enviar. Tente novamente com o mesmo pedido.",
        409,
      );
    await notify(data);
    return data;
  }
  const db = localDb();
  if (!insideTransaction) db.exec("BEGIN IMMEDIATE");
  try {
    const existing = db
      .prepare("SELECT data FROM orders WHERE idempotency_key=?")
      .get(input.idempotencyKey);
    if (existing) {
      const order = parseRow<Order>(existing);
      const table = db
        .prepare("SELECT token FROM restaurant_tables WHERE id=?")
        .get(order.tableId) as { token: string };
      if (table.token !== input.tableToken)
        throw new AppError("Chave de pedido inválida.", 409);
      if (!insideTransaction) db.exec("COMMIT");
      return order;
    }
    const catalog = getLocalCatalog();
    if (!catalog.settings.open)
      throw new AppError("A casa está fechada para novos pedidos.", 409);
    const table = catalog.tables.find(
      (t) => t.token === input.tableToken && t.active,
    );
    if (!table)
      throw new AppError("Mesa inválida. Escaneie novamente o QR Code.", 403);
    if (!catalog.settings.payments.includes(input.payment))
      throw new AppError("Forma de pagamento indisponível.");
    const items = priceCart(input.items, catalog);
    const at = new Date().toISOString();
    const number = Number(
      (
        db
          .prepare("SELECT COALESCE(MAX(number),0)+1 AS n FROM orders")
          .get() as { n: number }
      ).n,
    );
    const status = catalog.settings.sendImmediately ? "confirmed" : "received";
    const order: Order = {
      id: randomUUID(),
      number,
      trackingToken: randomUUID(),
      idempotencyKey: input.idempotencyKey,
      tableId: table.id,
      tableName: table.name,
      createdAt: at,
      updatedAt: at,
      status,
      version: 1,
      payment: input.payment,
      items,
      total: items.reduce((s, i) => s + i.total, 0),
      history: [
        { status: "received", at },
        ...(status === "confirmed"
          ? [{ status: "confirmed" as Status, at }]
          : []),
      ],
      analyticsSessionId: input.analyticsSessionId,
      dataMode:
        JSON.parse(
          (
            db
              .prepare("SELECT data FROM experience_settings WHERE id=1")
              .get() as { data: string } | undefined
          )?.data || "{}",
        ).dataMode || "production",
    };
    db.prepare(
      "INSERT INTO orders(id,number,tracking_token,idempotency_key,table_id,status,version,created_at,data) VALUES (?,?,?,?,?,?,?,?,?)",
    ).run(
      order.id,
      number,
      order.trackingToken,
      input.idempotencyKey,
      table.id,
      status,
      1,
      at,
      JSON.stringify(order),
    );
    const stmt = db.prepare("INSERT INTO order_items VALUES (?,?,?)");
    items.forEach((item) =>
      stmt.run(randomUUID(), order.id, JSON.stringify(item)),
    );
    const hist = db.prepare(
      "INSERT INTO order_status_history VALUES (?,?,?,?)",
    );
    order.history.forEach((h) =>
      hist.run(randomUUID(), order.id, h.status, h.at),
    );
    enqueueIntegrationEvent(db, order, "order.created");
    if (!insideTransaction) db.exec("COMMIT");
    return order;
  } catch (error) {
    if (!insideTransaction) db.exec("ROLLBACK");
    throw error;
  }
}
export async function updateOrder(
  id: string,
  status: Status,
  version: number,
): Promise<Order> {
  if (backend === "supabase") {
    const { data, error } = await supabase().rpc("advance_order", {
      p_id: id,
      p_status: status,
      p_version: version,
    });
    if (error)
      throw new AppError(
        "O pedido foi atualizado por outra pessoa. Recarregue a lista.",
        409,
      );
    await notify(data);
    return data;
  }
  const db = localDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare("SELECT data FROM orders WHERE id=?").get(id);
    if (!row) throw new AppError("Pedido não encontrado.", 404);
    const order = parseRow<Order>(row);
    if (order.version !== version)
      throw new AppError("O pedido já foi atualizado. Recarregue.", 409);
    assertTransition(order.status, status);
    order.status = status;
    order.version++;
    order.updatedAt = new Date().toISOString();
    order.history.push({ status, at: order.updatedAt });
    db.prepare("UPDATE orders SET data=?,status=?,version=? WHERE id=?").run(
      JSON.stringify(order),
      status,
      order.version,
      id,
    );
    db.prepare("INSERT INTO order_status_history VALUES (?,?,?,?)").run(
      randomUUID(),
      id,
      status,
      order.updatedAt,
    );
    enqueueIntegrationEvent(db, order, "order.status_changed");
    db.exec("COMMIT");
    return order;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
// Future printer/POS workers consume this outbox after commit.
function enqueueIntegrationEvent(db: DatabaseSync, order: Order, type: string) {
  const { trackingToken: _tracking, idempotencyKey: _key, ...snapshot } = order;
  db.prepare(
    "INSERT INTO integration_outbox(id,order_id,version,event_type,payload,created_at) VALUES (?,?,?,?,?,?)",
  ).run(
    randomUUID(),
    order.id,
    order.version,
    type,
    JSON.stringify(snapshot),
    order.updatedAt,
  );
}
async function notify(order: Order) {
  try {
    await supabase()
      .channel(`order:${order.trackingToken}`)
      .httpSend("changed", {});
  } catch {
    /* polling reconciles missed notifications */
  }
}
export async function saveEntity(
  kind: "product" | "category" | "table" | "settings",
  value: Product | Category | Table | Settings,
) {
  const tableName = {
    product: "menu_items",
    category: "menu_categories",
    table: "restaurant_tables",
    settings: "restaurant_settings",
  }[kind];
  const id = kind === "settings" ? 1 : (value as Product).id;
  if (backend === "sqlite") {
    if (kind === "product")
      localDb()
        .prepare(
          "INSERT INTO menu_items VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET category_id=excluded.category_id,data=excluded.data",
        )
        .run(id, (value as Product).categoryId, JSON.stringify(value));
    else if (kind === "table")
      localDb()
        .prepare(
          "INSERT INTO restaurant_tables VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,data=excluded.data",
        )
        .run(id, (value as Table).token, JSON.stringify(value));
    else
      localDb()
        .prepare(
          `INSERT INTO ${tableName} VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`,
        )
        .run(id, JSON.stringify(value));
  } else {
    const { error } = await supabase()
      .from(tableName)
      .upsert({
        id,
        data: value,
        ...(kind === "product"
          ? { category_id: (value as Product).categoryId }
          : {}),
        ...(kind === "table" ? { token: (value as Table).token } : {}),
      });
    dbError(error);
  }
}
export async function listStaff(): Promise<Staff[]> {
  if (backend === "sqlite")
    return localDb()
      .prepare("SELECT id,email,role,active FROM staff_users")
      .all()
      .map((s) => ({ ...s, active: !!s.active })) as Staff[];
  const { data, error } = await supabase()
    .from("staff_users")
    .select("id,email,role,active");
  dbError(error);
  return data || [];
}
export async function addStaff(
  email: string,
  password: string,
  role: Staff["role"],
) {
  if (backend === "sqlite") {
    try {
      localDb()
        .prepare("INSERT INTO staff_users VALUES (?,?,?,?,?)")
        .run(randomUUID(), email, role, 1, hashPassword(password));
    } catch {
      throw new AppError("Este e-mail já está cadastrado.", 409);
    }
  } else {
    const { data, error } = await supabase().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error)
      throw new AppError(
        "Não foi possível criar o funcionário. Verifique o e-mail e a senha.",
      );
    const result = await supabase()
      .from("staff_users")
      .insert({ id: data.user.id, email, role, active: true });
    if (result.error) {
      await supabase().auth.admin.deleteUser(data.user.id);
      dbError(result.error);
    }
  }
}
export async function setStaffActive(id: string, active: boolean) {
  if (backend === "sqlite")
    localDb()
      .prepare("UPDATE staff_users SET active=? WHERE id=?")
      .run(active ? 1 : 0, id);
  else {
    const { error } = await supabase()
      .from("staff_users")
      .update({ active })
      .eq("id", id);
    dbError(error);
  }
}
export async function recordEvent(event: AnalyticsEvent, verified = false) {
  const catalog = await getCatalog();
  if (
    event.productId &&
    !catalog.products.some((p) => p.id === event.productId)
  )
    throw new AppError("Produto inválido.");
  if (
    event.categoryId &&
    !catalog.categories.some((c) => c.id === event.categoryId)
  )
    throw new AppError("Categoria inválida.");
  if (
    event.tableId &&
    !catalog.tables.some((t) => t.id === event.tableId && t.active)
  )
    throw new AppError("Mesa inválida.");
  let dataMode: string;
  if (backend === "sqlite")
    dataMode =
      JSON.parse(
        (
          localDb()
            .prepare("SELECT data FROM experience_settings WHERE id=1")
            .get() as { data: string } | undefined
        )?.data || "{}",
      ).dataMode || "production";
  else {
    const r = await supabase()
      .from("experience_settings")
      .select("data")
      .eq("id", 1)
      .maybeSingle();
    dbError(r.error);
    dataMode = r.data?.data?.dataMode || "production";
  }
  if (backend === "sqlite")
    localDb()
      .prepare(
        "INSERT OR IGNORE INTO analytics_events(id,type,product_id,category_id,session_id,created_at,table_id,metadata,verified) VALUES (?,?,?,?,?,?,?,?,?)",
      )
      .run(
        event.id || randomUUID(),
        event.type,
        event.productId || null,
        event.categoryId || null,
        event.sessionId,
        new Date().toISOString(),
        event.tableId || null,
        JSON.stringify({ ...event.metadata, dataMode }),
        verified ? 1 : 0,
      );
  else {
    const { error } = await supabase()
      .from("analytics_events")
      .upsert(
        {
          id: event.id || randomUUID(),
          type: event.type,
          product_id: event.productId,
          category_id: event.categoryId,
          session_id: event.sessionId,
          table_id: event.tableId,
          metadata: { ...event.metadata, dataMode },
          verified,
        },
        { onConflict: "id", ignoreDuplicates: true },
      );
    dbError(error);
  }
}
export async function listEvents(since: string) {
  if (backend === "sqlite")
    return localDb()
      .prepare(
        "SELECT type,product_id,category_id,session_id,created_at FROM analytics_events WHERE created_at>=? AND json_extract(metadata,'$.dataMode')='production' ORDER BY created_at DESC LIMIT 50000",
      )
      .all(since) as {
      type: string;
      product_id: string | null;
      category_id: string | null;
      session_id: string;
      created_at: string;
    }[];
  const { data, error } = await supabase()
    .from("analytics_events")
    .select("type,product_id,category_id,session_id,created_at")
    .gte("created_at", since)
    .eq("metadata->>dataMode", "production")
    .order("created_at", { ascending: false })
    .limit(50000);
  dbError(error);
  return data || [];
}
