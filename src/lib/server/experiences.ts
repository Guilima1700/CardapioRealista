import "server-only";
import {
  randomBytes,
  randomUUID,
  createHash,
  createHmac,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import {
  backend,
  localDb,
  supabase,
  getCatalog,
  createOrder,
  findOrder,
  hashPassword,
} from "./db";
import { AppError, priceCart } from "../validation";
import {
  defaultExperienceSettings,
  experienceSettingsSchema,
  requireParticipant,
  transitionGroup,
  pricedGroup,
  splitCents,
  reviewSchema,
  type GroupState,
  type GroupAction,
  type Participant,
  type Review,
} from "../experiences";
import type { Order } from "../types";
import type { GroupView } from "../experiences";
const digest = (v: string) => createHash("sha256").update(v).digest("hex");
function failure(error: any) {
  if (error)
    throw new AppError(
      error.message?.includes("APP:")
        ? error.message.split("APP:")[1]
        : "Não foi possível salvar. Confira a conexão e tente novamente.",
      409,
    );
}
export async function experienceConfig() {
  let row: any;
  if (backend === "sqlite") {
    row = localDb()
      .prepare("SELECT * FROM experience_settings WHERE id=1")
      .get();
    if (row) row = { ...row, data: JSON.parse(row.data) };
  } else {
    const r = await supabase()
      .from("experience_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    failure(r.error);
    row = r.data;
  }
  return {
    config: experienceSettingsSchema.parse({
      ...defaultExperienceSettings,
      ...row?.data,
    }),
    pinHash: row?.pin_hash as string | undefined,
  };
}
export async function saveExperienceConfig(value: unknown, pin?: string) {
  const config = experienceSettingsSchema.parse(value);
  const current = await experienceConfig();
  const pinHash = pin ? hashPassword(pin) : current.pinHash;
  if (config.entryMode === "pin" && !pinHash)
    throw new AppError("Defina a senha de entrada.");
  if (backend === "sqlite")
    localDb()
      .prepare(
        "INSERT INTO experience_settings VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,pin_hash=excluded.pin_hash",
      )
      .run(JSON.stringify(config), pinHash || null);
  else {
    const r = await supabase()
      .from("experience_settings")
      .upsert({ id: 1, data: config, pin_hash: pinHash || null });
    failure(r.error);
  }
  return config;
}
export async function joinThrottle(ip: string, tableId: string) {
  const until = Math.ceil(Date.now() / 600000) * 600000;
  const key = createHmac("sha256", process.env.SESSION_SECRET || "local-only")
    .update(`${ip}:${tableId}:${until}`)
    .digest("hex");
  if (backend === "sqlite") {
    const db = localDb();
    db.prepare("DELETE FROM experience_rate_limits WHERE expires_at<?").run(
      Date.now(),
    );
    const r = db
      .prepare(
        "INSERT INTO experience_rate_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
      )
      .get(key, until) as { count: number };
    if (r.count > 10)
      throw new AppError(
        "Muitas tentativas de entrada. Aguarde alguns minutos.",
        429,
      );
  } else {
    const r = await supabase().rpc("brasa_experience_throttle", {
      p_key: key,
      p_until: until,
    });
    failure(r.error);
    if (!r.data)
      throw new AppError(
        "Muitas tentativas de entrada. Aguarde alguns minutos.",
        429,
      );
  }
}
export async function activeGroup(
  tableId: string,
): Promise<GroupState | undefined> {
  if (backend === "sqlite") {
    const db = localDb();
    db.prepare(
      "UPDATE table_sessions SET active=0,version=version+1,data=json_set(data,'$.status','expired','$.version',version+1) WHERE table_id=? AND active=1 AND expires_at<=?",
    ).run(tableId, new Date().toISOString());
    const row = db
      .prepare("SELECT data FROM table_sessions WHERE table_id=? AND active=1")
      .get(tableId) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : undefined;
  }
  const expired = await supabase()
    .from("table_sessions")
    .select("id,data,version")
    .eq("table_id", tableId)
    .eq("active", true)
    .lte("expires_at", new Date().toISOString());
  failure(expired.error);
  for (const row of expired.data || []) {
    const r = await supabase()
      .from("table_sessions")
      .update({
        active: false,
        version: row.version + 1,
        data: { ...row.data, status: "expired", version: row.version + 1 },
      })
      .eq("id", row.id)
      .eq("version", row.version);
    failure(r.error);
  }
  const r = await supabase()
    .from("table_sessions")
    .select("data")
    .eq("table_id", tableId)
    .eq("active", true)
    .maybeSingle();
  failure(r.error);
  return r.data?.data;
}
async function groupById(id: string): Promise<GroupState> {
  if (backend === "sqlite") {
    const row = localDb()
      .prepare("SELECT data FROM table_sessions WHERE id=?")
      .get(id) as { data: string } | undefined;
    if (row) return JSON.parse(row.data);
  } else {
    const r = await supabase()
      .from("table_sessions")
      .select("data")
      .eq("id", id)
      .maybeSingle();
    failure(r.error);
    if (r.data) return r.data.data;
  }
  throw new AppError("Sessão não encontrada.", 404);
}
async function saveGroup(
  before: GroupState,
  next: GroupState,
  mutationId: string,
): Promise<GroupState | undefined> {
  if (backend === "supabase") {
    const r = await supabase().rpc("brasa_save_group", {
      p_id: before.id,
      p_version: before.version,
      p_mutation: mutationId,
      p_state: next,
    });
    failure(r.error);
    return r.data || undefined;
  }
  const db = localDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const current = await groupById(before.id);
    if (
      ["closed", "expired"].includes(current.status) ||
      Date.parse(current.expiresAt) <= Date.now()
    )
      throw new AppError("Sessão encerrada ou expirada.", 410);
    if (
      db
        .prepare(
          "SELECT 1 FROM session_actions WHERE session_id=? AND mutation_id=?",
        )
        .get(before.id, mutationId)
    ) {
      db.exec("COMMIT");
      return current;
    }
    if (current.version !== before.version) {
      db.exec("ROLLBACK");
      return undefined;
    }
    next.version = before.version + 1;
    db.prepare(
      "UPDATE table_sessions SET data=?,version=?,active=? WHERE id=?",
    ).run(
      JSON.stringify(next),
      next.version,
      ["closed", "expired"].includes(next.status) ? 0 : 1,
      next.id,
    );
    db.prepare("INSERT INTO session_actions VALUES(?,?)").run(
      next.id,
      mutationId,
    );
    db.exec("COMMIT");
    return next;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export async function joinGroup(
  tableId: string,
  name: string,
  pin: string | undefined,
  existingSecret: string | undefined,
  analyticsSessionId: string | undefined,
) {
  const { config, pinHash } = await experienceConfig();
  if (!config.collectiveEnabled)
    throw new AppError("Pedidos coletivos estão desativados.", 403);
  const catalog = await getCatalog();
  if (!catalog.tables.some((t) => t.id === tableId && t.active))
    throw new AppError("Mesa indisponível.", 404);
  if (config.entryMode === "pin") {
    const [salt, hash] = (pinHash || "").split(":");
    const actual = scryptSync(pin || "", salt || "missing", 64),
      expected = Buffer.from(hash || "", "hex");
    if (expected.length !== actual.length || !timingSafeEqual(actual, expected))
      throw new AppError("Senha de entrada incorreta.", 403);
  }
  const secret = randomBytes(32).toString("base64url"),
    secretHash = digest(secret),
    id = randomUUID(),
    mutation = randomUUID();
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = await activeGroup(tableId);
    const at = new Date().toISOString();
    const participant: Participant = {
      id,
      name,
      secretHash,
      approved: config.entryMode !== "approval",
      joinedAt: at,
      analyticsSessionId,
    };
    if (!current) {
      const state: GroupState = {
        id: randomUUID(),
        tableId,
        status: "waiting",
        version: 1,
        ownerId: id,
        joinClosed: false,
        createdAt: at,
        expiresAt: new Date(
          Date.now() + config.sessionMinutes * 60000,
        ).toISOString(),
        roundKey: randomUUID(),
        topic: randomBytes(32).toString("hex"),
        participants: [participant],
        items: [],
        orders: [],
      };
      if (backend === "sqlite") {
        try {
          localDb()
            .prepare("INSERT INTO table_sessions VALUES(?,?,1,1,?,?)")
            .run(state.id, tableId, state.expiresAt, JSON.stringify(state));
          return { state, secret };
        } catch (e: any) {
          if (!e.message.includes("UNIQUE")) throw e;
        }
      } else {
        const r = await supabase().from("table_sessions").insert({
          id: state.id,
          table_id: tableId,
          active: true,
          version: 1,
          expires_at: state.expiresAt,
          data: state,
        });
        if (!r.error) return { state, secret };
        if (r.error.code !== "23505") failure(r.error);
      }
      continue;
    }
    const member = existingSecret
      ? current.participants.find(
          (p) => p.secretHash === digest(existingSecret),
        )
      : undefined;
    if (member) return { state: current, secret: existingSecret! };
    if (current.joinClosed || !["waiting", "editing"].includes(current.status))
      throw new AppError(
        "O responsável encerrou a entrada de participantes.",
        409,
      );
    if (current.participants.length >= 24)
      throw new AppError("Limite de participantes atingido.", 409);
    const before = structuredClone(current);
    current.participants.push(participant);
    const saved = await saveGroup(before, current, mutation);
    if (saved) return { state: saved, secret };
  }
  throw new AppError(
    "A mesa está recebendo outras pessoas. Tente entrar novamente.",
    409,
  );
}
export async function groupView(
  state: GroupState,
  secret: string,
): Promise<GroupView> {
  const member = requireParticipant(state, digest(secret));
  const { config } = await experienceConfig();
  if (!member.approved)
    return {
      id: state.id,
      status: state.status,
      version: state.version,
      me: {
        id: member.id,
        name: member.name,
        approved: false,
        denied: !!(member as any).denied,
      },
      participants: [],
      items: [],
      orders: [],
      total: 0,
      individual: [],
      equal: [],
      config,
      expiresAt: state.expiresAt,
      ownerId: state.ownerId,
      joinClosed: state.joinClosed,
    };
  const catalog = await getCatalog();
  const items: ReturnType<typeof pricedGroup> = [];
  let quoteError = "";
  for (const item of state.items) {
    try {
      const priced = priceCart([item], catalog)[0];
      items.push({
        ...priced,
        id: item.id,
        version: item.version,
        participantId: item.participantId,
        participantName:
          state.participants.find((p) => p.id === item.participantId)?.name ||
          "Participante",
      });
    } catch (e) {
      quoteError = (e as Error).message;
      items.push({
        ...item,
        name:
          catalog.products.find((p) => p.id === item.productId)?.name ||
          "Produto indisponível",
        unitPrice: 0,
        total: 0,
        modifiers: [],
        allergens: [],
        participantName:
          state.participants.find((p) => p.id === item.participantId)?.name ||
          "Participante",
      });
    }
  }
  const current = ["editing", "waiting", "review"].includes(state.status)
    ? items
    : [];
  const all = [...state.orders.flatMap((o) => o.items), ...current];
  const total = all.reduce((s, i) => s + i.total, 0),
    ids = state.participants.filter((p) => p.approved).map((p) => p.id);
  return {
    id: state.id,
    status: state.status,
    version: state.version,
    me: { id: member.id, name: member.name, approved: true },
    ownerId: state.ownerId,
    joinClosed: state.joinClosed,
    expiresAt: state.expiresAt,
    topic: state.topic,
    participants: state.participants.map(
      ({ secretHash, analyticsSessionId, ...p }) => p,
    ),
    items,
    orders: state.orders.map(({ analyticsSessionId: _session, ...o }) => ({
      ...o,
      items: o.items.map(({ analyticsSessionId: _itemSession, ...i }) => i),
    })),
    total,
    individual: ids.map((id) => ({
      participantId: id,
      total: all
        .filter((i) => i.participantId === id)
        .reduce((s, i) => s + i.total, 0),
    })),
    equal: splitCents(total, ids),
    config,
    quoteError,
  };
}
export async function mutateGroup(
  tableId: string,
  secret: string,
  action: GroupAction,
  mutationId: string,
) {
  const { config } = await experienceConfig();
  const catalog = await getCatalog();
  const ids = { itemId: randomUUID(), roundKey: randomUUID() };
  for (let attempt = 0; attempt < 8; attempt++) {
    const before = await activeGroup(tableId);
    if (!before) throw new AppError("Sessão encerrada ou expirada.", 410);
    const next = structuredClone(before),
      member = requireParticipant(next, digest(secret));
    transitionGroup(next, action, member, catalog, config, ids);
    const saved = await saveGroup(before, next, mutationId);
    if (saved)
      return action.action === "close"
        ? { closed: true }
        : groupView(saved, secret);
  }
  throw new AppError("O pedido está sendo atualizado. Tente novamente.", 409);
}
export async function checkoutGroup(
  tableId: string,
  secret: string,
  payment: "cashier" | "table",
) {
  const state = await activeGroup(tableId);
  if (!state) throw new AppError("Sessão encerrada ou expirada.", 410);
  const member = requireParticipant(state, digest(secret));
  if (!member.approved || state.ownerId !== member.id)
    throw new AppError("Somente o responsável pode confirmar.", 403);
  if (backend === "supabase") {
    const r = await supabase().rpc("brasa_group_checkout", {
      p_id: state.id,
      p_hash: digest(secret),
      p_payment: payment,
    });
    failure(r.error);
    return r.data as Order;
  }
  const db = localDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const current = await groupById(state.id);
    const existing = current.orders.find(
      (o) => o.idempotencyKey === current.roundKey,
    );
    if (existing) {
      db.exec("COMMIT");
      return existing;
    }
    if (current.status !== "review")
      throw new AppError("Revise o pedido antes de confirmar.", 409);
    const catalog = await getCatalog(),
      table = catalog.tables.find((t) => t.id === tableId)!;
    const lines = current.items.map((item) => {
      const p = current.participants.find((p) => p.id === item.participantId)!;
      return {
        ...item,
        participantName: p.name,
        analyticsSessionId: p.analyticsSessionId,
      };
    });
    const order = await createOrder(
      {
        tableToken: table.token,
        idempotencyKey: current.roundKey,
        payment,
        items: lines,
        analyticsSessionId: member.analyticsSessionId,
      },
      true,
    );
    if (order.total !== current.reviewTotal)
      throw new AppError(
        "Os preços mudaram. Volte à edição e revise novamente.",
        409,
      );
    order.groupSessionId = state.id;
    db.prepare("UPDATE orders SET data=? WHERE id=?").run(
      JSON.stringify(order),
      order.id,
    );
    current.orders.push(order);
    current.status = "sent";
    current.joinClosed = true;
    current.version++;
    db.prepare("UPDATE table_sessions SET data=?,version=? WHERE id=?").run(
      JSON.stringify(current),
      current.version,
      current.id,
    );
    db.exec("COMMIT");
    return order;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export async function approveParticipant(
  sessionId: string,
  participantId: string,
  approved: boolean,
) {
  const mutationId = randomUUID();
  for (let i = 0; i < 8; i++) {
    const state = await groupById(sessionId),
      next = structuredClone(state);
    if (Date.parse(state.expiresAt) <= Date.now())
      throw new AppError("Sessão expirada.", 410);
    const p = next.participants.find((p) => p.id === participantId);
    if (!p) throw new AppError("Participante inexistente.", 404);
    p.approved = approved;
    (p as any).denied = !approved;
    if (
      approved &&
      !next.participants.find((p) => p.id === next.ownerId)?.approved
    )
      next.ownerId = p.id;
    if (await saveGroup(state, next, mutationId)) return { ok: true };
  }
  throw new AppError("Sessão atualizada por outra pessoa.", 409);
}
export async function staffGroups() {
  let states: GroupState[];
  if (backend === "sqlite")
    states = (
      localDb()
        .prepare(
          "SELECT data FROM table_sessions WHERE active=1 ORDER BY expires_at",
        )
        .all() as { data: string }[]
    ).map((r) => JSON.parse(r.data));
  else {
    const r = await supabase()
      .from("table_sessions")
      .select("data")
      .eq("active", true)
      .order("expires_at");
    failure(r.error);
    states = (r.data || []).map((r) => r.data);
  }
  return states.map((s) => ({
    ...s,
    topic: undefined,
    participants: s.participants.map(
      ({ secretHash, analyticsSessionId, ...p }) => p,
    ),
  }));
}
export async function closeStaffGroup(id: string, actor: string) {
  const mutation = randomUUID();
  for (let i = 0; i < 8; i++) {
    const state = await groupById(id);
    if (["closed", "expired"].includes(state.status)) return { ok: true };
    const next = {
      ...structuredClone(state),
      status: "closed" as const,
      joinClosed: true,
      closedBy: actor,
      closedAt: new Date().toISOString(),
    };
    if (await saveGroup(state, next, mutation)) return { ok: true };
  }
  throw new AppError("A sessão mudou. Atualize antes de encerrar.", 409);
}
export async function reviewAvailability(token: string) {
  const order = await findOrder(token);
  if (!order) throw new AppError("Pedido não encontrado.", 404);
  const { config } = await experienceConfig();
  const at = order.history.find((h) => h.status === "delivered")?.at;
  let existing: boolean;
  if (backend === "sqlite")
    existing = !!localDb()
      .prepare("SELECT id FROM order_reviews WHERE order_id=?")
      .get(order.id);
  else {
    const r = await supabase()
      .from("order_reviews")
      .select("id")
      .eq("order_id", order.id)
      .maybeSingle();
    failure(r.error);
    existing = !!r.data;
  }
  const eligibleAt = at
    ? new Date(Date.parse(at) + config.reviewDelayMinutes * 60000).toISOString()
    : null;
  return {
    order,
    config,
    existing,
    eligibleAt,
    eligible:
      config.reviewEnabled &&
      order.status === "delivered" &&
      !!eligibleAt &&
      Date.parse(eligibleAt) <= Date.now(),
  };
}
export async function submitReview(token: string, input: unknown) {
  const value = reviewSchema.parse(input),
    availability = await reviewAvailability(token);
  if (availability.existing) return { ok: true, alreadySubmitted: true };
  if (!availability.eligible)
    throw new AppError(
      "A avaliação será disponibilizada após a entrega e o intervalo definido pela casa.",
      409,
    );
  const review: Review = {
    ...value,
    hasProblem: value.hasProblem || value.issues.length > 0,
    id: randomUUID(),
    orderId: availability.order.id,
    tableId: availability.order.tableId,
    createdAt: new Date().toISOString(),
    status: "new",
    version: 1,
  };
  if (backend === "sqlite")
    localDb()
      .prepare(
        "INSERT INTO order_reviews VALUES(?,?,?,?,?,?,?) ON CONFLICT(order_id) DO NOTHING",
      )
      .run(
        review.id,
        review.orderId,
        review.tableId,
        review.createdAt,
        review.status,
        1,
        JSON.stringify(review),
      );
  else {
    const r = await supabase().from("order_reviews").upsert(
      {
        id: review.id,
        order_id: review.orderId,
        table_id: review.tableId,
        created_at: review.createdAt,
        status: "new",
        version: 1,
        data: review,
      },
      { onConflict: "order_id", ignoreDuplicates: true },
    );
    failure(r.error);
  }
  return { ok: true };
}
