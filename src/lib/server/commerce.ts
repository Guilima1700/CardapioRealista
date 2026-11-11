import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { backend, localDb, supabase, getCatalog } from "./db";
import { experienceConfig } from "./experiences";
import {
  analyzeCommerce,
  commercialPeriod,
  reviewInsights,
  type CommercialEvent,
  type Recommendation,
} from "../intelligence";
import type { Order } from "../types";
import type { Review } from "../experiences";
import { AppError } from "../validation";
import { commerceExample } from "../commerce-example";
function check(error: any) {
  if (error)
    throw new AppError(
      error.message?.includes("APP:")
        ? error.message.split("APP:")[1]
        : "Não foi possível consultar ou salvar os dados.",
      409,
    );
}
const decode = (rows: any[]) =>
  rows.map((r) => (typeof r.data === "string" ? JSON.parse(r.data) : r.data));
export async function periodRows(
  table: "orders" | "analytics_events" | "order_reviews",
  start: string,
  end: string,
) {
  if (backend === "sqlite") {
    const rows = localDb()
      .prepare(
        `SELECT * FROM ${table} WHERE created_at>=? AND created_at<? ORDER BY created_at,id`,
      )
      .all(start, end) as any[];
    return { rows, complete: true };
  }
  const rows: any[] = [];
  let complete = true;
  for (let offset = 0; offset < 100000; offset += 1000) {
    const r = await supabase()
      .from(table)
      .select("*")
      .gte("created_at", start)
      .lt("created_at", end)
      .order("created_at")
      .order("id")
      .range(offset, offset + 999);
    check(r.error);
    rows.push(...(r.data || []));
    if ((r.data?.length || 0) < 1000) break;
    if (offset === 99000) complete = false;
  }
  return { rows, complete };
}
export async function commercialReport(params: URLSearchParams) {
  const catalog = await getCatalog(),
    { config } = await experienceConfig();
  let period;
  try {
    period = commercialPeriod(
      params.get("period") || "30",
      catalog.settings.timezone,
      params.get("from") || undefined,
      params.get("to") || undefined,
    );
  } catch (e) {
    throw new AppError((e as Error).message);
  }
  const source = params.get("source") === "demo" ? "demo" : "production";
  if (params.get("example") === "1") {
    const sample = commerceExample(catalog, period);
    return {
      ...analyzeCommerce(
        catalog,
        sample.orders,
        sample.events,
        period,
        config,
        "demo",
      ),
      example: true,
      actions: [],
      config,
    };
  }
  const [o, e] = await Promise.all([
    periodRows("orders", period.previousStart, period.end),
    periodRows("analytics_events", period.start, period.end),
  ]);
  const events: CommercialEvent[] = e.rows.map((r) => ({
    ...r,
    metadata:
      typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata,
  }));
  const report = analyzeCommerce(
    catalog,
    decode(o.rows),
    events,
    period,
    config,
    source,
    o.complete && e.complete,
  );
  const canonical = (value: unknown) =>
    JSON.stringify(value, (_key, v) =>
      v && typeof v === "object" && !Array.isArray(v)
        ? Object.fromEntries(
            Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
          )
        : v,
    );
  const freshFingerprints = new Set(
    report.recommendations.map((r) =>
      createHash("sha256").update(r.fingerprint).digest("hex"),
    ),
  );
  for (const rec of report.recommendations) {
    const id = randomUUID(),
      fingerprint = createHash("sha256").update(rec.fingerprint).digest("hex"),
      data = { ...rec, fingerprint };
    if (backend === "sqlite")
      localDb()
        .prepare(
          "INSERT INTO commercial_recommendations VALUES(?,?,'new',1,?,?) ON CONFLICT(fingerprint) DO NOTHING",
        )
        .run(id, fingerprint, new Date().toISOString(), JSON.stringify(data));
    else {
      const r = await supabase()
        .from("commercial_recommendations")
        .upsert(
          { id, fingerprint, data },
          { onConflict: "fingerprint", ignoreDuplicates: true },
        );
      check(r.error);
    }
    // Refresh evidence only while unhandled; a concurrent admin action wins.
    if (backend === "sqlite")
      localDb()
        .prepare(
          "UPDATE commercial_recommendations SET data=?,version=version+1 WHERE fingerprint=? AND status='new' AND data<>?",
        )
        .run(JSON.stringify(data), fingerprint, JSON.stringify(data));
    else {
      const old = await supabase()
        .from("commercial_recommendations")
        .select("id,data,version,status")
        .eq("fingerprint", fingerprint)
        .single();
      check(old.error);
      if (
        old.data?.status === "new" &&
        canonical(old.data.data) !== canonical(data)
      ) {
        const updated = await supabase()
          .from("commercial_recommendations")
          .update({ data, version: old.data.version + 1 })
          .eq("id", old.data.id)
          .eq("version", old.data.version)
          .eq("status", "new");
        check(updated.error);
      }
    }
  }
  let saved: any[], actions: any[];
  if (backend === "sqlite") {
    saved = localDb()
      .prepare(
        "SELECT * FROM commercial_recommendations ORDER BY created_at DESC LIMIT 300",
      )
      .all();
    actions = localDb()
      .prepare(
        "SELECT * FROM recommendation_actions ORDER BY created_at DESC LIMIT 100",
      )
      .all();
  } else {
    const results = await Promise.all([
      supabase()
        .from("commercial_recommendations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300),
      supabase()
        .from("recommendation_actions")
        .select("actor,action,created_at,recommendation_id")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    results.forEach((r) => check(r.error));
    saved = results[0].data || [];
    actions = results[1].data || [];
  }
  const recommendations: Recommendation[] = saved
    .map((r) => ({
      ...(typeof r.data === "string" ? JSON.parse(r.data) : r.data),
      id: r.id,
      status: r.status,
      version: r.version,
      createdAt: r.created_at,
    }))
    .filter(
      (r) =>
        r.source === source &&
        ((r.start === period.start &&
          r.end === period.end &&
          freshFingerprints.has(r.fingerprint)) ||
          r.status !== "new"),
    );
  const sourceIds = new Set(
    saved
      .filter(
        (r) =>
          (typeof r.data === "string" ? JSON.parse(r.data) : r.data).source ===
          source,
      )
      .map((r) => r.id),
  );
  return {
    ...report,
    recommendations,
    actions: actions.filter((a) => sourceIds.has(a.recommendation_id)),
    config,
  };
}
export type RecommendationAction = {
  id: string;
  version: number;
  mutationId: string;
  action: "apply" | "ignore" | "resolve" | "disable";
  confirmed?: boolean;
  text?: string;
};
export async function actOnRecommendation(
  input: RecommendationAction,
  actor: string,
) {
  if (input.action === "apply" && !input.confirmed)
    throw new AppError("Confirme a alteração antes de aplicar.", 409);
  if (input.action === "apply") {
    let row: any;
    if (backend === "sqlite")
      row = localDb()
        .prepare("SELECT data FROM commercial_recommendations WHERE id=?")
        .get(input.id);
    else {
      const result = await supabase()
        .from("commercial_recommendations")
        .select("data")
        .eq("id", input.id)
        .maybeSingle();
      check(result.error);
      row = result.data;
    }
    if (!row) throw new AppError("Recomendação não encontrada.", 404);
    const rec: Recommendation =
      typeof row.data === "string" ? JSON.parse(row.data) : row.data;
    const catalog = await getCatalog(),
      { config } = await experienceConfig(),
      period = {
        start: rec.start,
        end: rec.end,
        previousStart: new Date(
          Date.parse(rec.start) - (Date.parse(rec.end) - Date.parse(rec.start)),
        ).toISOString(),
        label: "Revalidação",
      };
    const [orders, events] = await Promise.all([
      periodRows("orders", period.start, period.end),
      periodRows("analytics_events", period.start, period.end),
    ]);
    const report = analyzeCommerce(
      catalog,
      decode(orders.rows),
      events.rows.map((e) => ({
        ...e,
        metadata:
          typeof e.metadata === "string" ? JSON.parse(e.metadata) : e.metadata,
      })),
      period,
      config,
      rec.source,
      orders.complete && events.complete,
    );
    if (
      !report.recommendations.some(
        (r) =>
          createHash("sha256").update(r.fingerprint).digest("hex") ===
          rec.fingerprint,
      )
    )
      throw new AppError(
        "Os dados mudaram. Recarregue a análise antes de aplicar esta recomendação.",
        409,
      );
  }
  if (backend === "supabase") {
    const r = await supabase().rpc("brasa_recommendation_action", {
      p_id: input.id,
      p_version: input.version,
      p_mutation: input.mutationId,
      p_action: input.action,
      p_actor: actor,
      p_confirmed: !!input.confirmed,
      p_text: input.text || "",
    });
    check(r.error);
    return { ok: true };
  }
  const db = localDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    if (
      db
        .prepare(
          "SELECT id FROM recommendation_actions WHERE id=? AND recommendation_id=?",
        )
        .get(input.mutationId, input.id)
    ) {
      db.exec("COMMIT");
      return { ok: true };
    }
    const row = db
      .prepare("SELECT * FROM commercial_recommendations WHERE id=?")
      .get(input.id) as any;
    if (!row) throw new AppError("Recomendação não encontrada.", 404);
    if (row.version !== input.version)
      throw new AppError(
        "A recomendação foi atualizada. Recarregue o painel.",
        409,
      );
    const rec: Recommendation = JSON.parse(row.data),
      at = new Date().toISOString();
    let status = row.status;
    if (input.action === "apply") {
      if (!["new", "applied"].includes(status))
        throw new AppError("Esta recomendação já foi encerrada.", 409);
      if (rec.source !== (await experienceConfig()).config.dataMode)
        throw new AppError(
          "A fonte da recomendação deve corresponder ao modo atual da instalação.",
          409,
        );
      if (Date.parse(rec.end) < Date.now() - 7 * 86400000)
        throw new AppError(
          "Esta recomendação está desatualizada. Gere uma análise recente.",
          409,
        );
      if (["feature", "description", "modifier", "pair"].includes(rec.action)) {
        const pRow = db
          .prepare("SELECT data FROM menu_items WHERE id=?")
          .get(rec.productId!) as { data: string } | undefined;
        if (!pRow) throw new AppError("Produto indisponível.");
        const p = JSON.parse(pRow.data);
        if (!p.available) throw new AppError("Produto indisponível.");
        if (rec.action === "feature") p.featured = true;
        if (rec.action === "description") {
          if (!input.text?.trim() || input.text.length > 1000)
            throw new AppError(
              "Escreva a nova descrição (até 1.000 caracteres).",
            );
          p.description = input.text.trim();
        }
        if (rec.action === "modifier") {
          let found = false;
          for (const g of p.groups)
            for (const m of g.options)
              if (m.id === rec.modifierId) {
                m.featured = true;
                found = true;
              }
          if (!found) throw new AppError("Adicional não encontrado.");
        }
        if (rec.action === "pair") {
          const pair = db
            .prepare("SELECT data FROM menu_items WHERE id=?")
            .get(rec.relatedId!) as { data: string } | undefined;
          if (!pair || !JSON.parse(pair.data).available)
            throw new AppError("Acompanhamento indisponível.");
          rec.publicEnabled = true;
        }
        db.prepare("UPDATE menu_items SET data=? WHERE id=?").run(
          JSON.stringify(p),
          p.id,
        );
      } else if (rec.action === "campaign") {
        if (!input.text?.trim() || input.text.length > 240)
          throw new AppError(
            "Escreva a mensagem da campanha (até 240 caracteres).",
          );
        rec.publicEnabled = true;
        rec.campaignText = input.text.trim();
      }
      status = "applied";
    } else if (input.action === "ignore") status = "ignored";
    else if (input.action === "resolve") status = "resolved";
    else rec.publicEnabled = false;
    if (["ignored", "resolved"].includes(status)) rec.publicEnabled = false;
    db.prepare(
      "UPDATE commercial_recommendations SET status=?,version=version+1,data=? WHERE id=?",
    ).run(status, JSON.stringify(rec), row.id);
    db.prepare("INSERT INTO recommendation_actions VALUES(?,?,?,?,?,?)").run(
      input.mutationId,
      row.id,
      actor,
      input.action,
      at,
      JSON.stringify({
        before: JSON.parse(row.data),
        after: rec,
        status,
        text: input.text || "",
      }),
    );
    db.exec("COMMIT");
    return { ok: true };
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export async function publicRecommendations() {
  const { config } = await experienceConfig();
  let rows: any[];
  if (backend === "sqlite")
    rows = localDb()
      .prepare(
        "SELECT * FROM commercial_recommendations WHERE status='applied' ORDER BY created_at DESC LIMIT 100",
      )
      .all();
  else {
    const r = await supabase()
      .from("commercial_recommendations")
      .select("*")
      .eq("status", "applied")
      .order("created_at", { ascending: false })
      .limit(100);
    check(r.error);
    rows = r.data || [];
  }
  const catalog = await getCatalog();
  return rows
    .map((r) => ({
      id: r.id,
      ...(typeof r.data === "string" ? JSON.parse(r.data) : r.data),
    }))
    .filter(
      (r: Recommendation) =>
        r.source === config.dataMode &&
        r.publicEnabled &&
        (r.action === "campaign" ||
          [r.productId, r.relatedId].every((id) =>
            catalog.products.some((p) => p.id === id && p.available),
          )),
    )
    .map((r: Recommendation) => ({
      id: r.id,
      productId: r.productId,
      relatedId: r.relatedId,
      text:
        r.action === "campaign"
          ? r.campaignText
          : "Uma combinação que sai bem por aqui.",
      hour: r.hour,
    }));
}
export async function reviewsReport(params: URLSearchParams) {
  const catalog = await getCatalog();
  let period;
  try {
    period = commercialPeriod(
      params.get("period") || "30",
      catalog.settings.timezone,
      params.get("from") || undefined,
      params.get("to") || undefined,
    );
  } catch (e) {
    throw new AppError((e as Error).message);
  }
  const { config } = await experienceConfig();
  const fetched = await periodRows("order_reviews", period.start, period.end);
  let reviews: Review[] = decode(fetched.rows);
  const source = params.get("source") === "demo" ? "demo" : "production";
  const ids = [...new Set(reviews.map((r) => r.orderId))];
  let orders: Order[] = [];
  if (backend === "sqlite")
    orders = ids.flatMap((id) => {
      const r = localDb()
        .prepare("SELECT data FROM orders WHERE id=?")
        .get(id) as { data: string } | undefined;
      return r ? [JSON.parse(r.data)] : [];
    });
  else
    for (let i = 0; i < ids.length; i += 100) {
      const r = await supabase()
        .from("orders")
        .select("data")
        .in("id", ids.slice(i, i + 100));
      check(r.error);
      orders.push(...decode(r.data || []));
    }
  const byId = new Map(orders.map((o) => [o.id, o]));
  reviews = reviews.filter((r) => byId.get(r.orderId)?.dataMode === source);
  const rating = Number(params.get("rating")),
    issue = params.get("issue"),
    product = params.get("product"),
    table = params.get("table"),
    status = params.get("status");
  reviews = reviews.filter(
    (r) =>
      (!rating || Math.min(r.food, r.service, r.wait) <= rating) &&
      (!issue || r.issues.includes(issue as Review["issues"][number])) &&
      (!product ||
        byId.get(r.orderId)?.items.some((i) => i.productId === product)) &&
      (!table || r.tableId === table) &&
      (!status || r.status === status),
  );
  return {
    period,
    source,
    complete: fetched.complete,
    ...reviewInsights(reviews, config.lowRating),
    reviews: reviews
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => ({ ...r, order: byId.get(r.orderId) })),
    products: catalog.products.map((p) => ({ id: p.id, name: p.name })),
    tables: catalog.tables,
    config,
  };
}
export async function updateReview(
  id: string,
  status: Review["status"],
  version: number,
) {
  if (backend === "sqlite") {
    const db = localDb();
    const result = db
      .prepare(
        "UPDATE order_reviews SET status=?,version=version+1,data=json_set(data,'$.status',?,'$.version',version+1) WHERE id=? AND version=?",
      )
      .run(status, status, id, version);
    if (!result.changes)
      throw new AppError(
        "A avaliação foi atualizada por outra pessoa. Recarregue.",
        409,
      );
  } else {
    const r = await supabase()
      .from("order_reviews")
      .select("data")
      .eq("id", id)
      .eq("version", version)
      .maybeSingle();
    check(r.error);
    if (!r.data) throw new AppError("Avaliação atualizada. Recarregue.", 409);
    const saved = await supabase()
      .from("order_reviews")
      .update({
        status,
        version: version + 1,
        data: { ...r.data.data, status, version: version + 1 },
      })
      .eq("id", id)
      .eq("version", version)
      .select("id");
    check(saved.error);
    if (!saved.data?.length)
      throw new AppError("Avaliação atualizada. Recarregue.", 409);
  }
  return { ok: true };
}
