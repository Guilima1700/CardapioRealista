import type { Catalog, Order, Product } from "./types";
import type { ExperienceSettings, Review } from "./experiences";
export type CommercialEvent = {
  id: string;
  type: string;
  session_id: string;
  product_id?: string;
  category_id?: string;
  created_at: string;
  table_id?: string;
  order_id?: string;
  metadata?: Record<string, unknown>;
  verified?: boolean | number;
};
export type Period = {
  start: string;
  end: string;
  previousStart: string;
  label: string;
};
const day = 86400000;
const calendars = new Map<string, Intl.DateTimeFormat>();
function calendar(iso: string, zone: string) {
  if (!calendars.has(zone))
    calendars.set(
      zone,
      new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
    );
  return calendars.get(zone)!.format(new Date(iso));
}
function midnight(date: string, zone: string) {
  const target = Date.parse(date + "T00:00:00Z");
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    const local = Date.parse(
      `${v.year}-${v.month}-${v.day}T${v.hour}:${v.minute}:${v.second}Z`,
    );
    const next = guess + target - local;
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess).toISOString();
}
export function commercialPeriod(
  key: string,
  zone: string,
  from?: string,
  to?: string,
  now = new Date(),
): Period {
  const today = calendar(now.toISOString(), zone),
    date = new Date(today + "T00:00:00Z");
  let start = today,
    end = new Date(date.getTime() + day).toISOString().slice(0, 10),
    label = "Hoje";
  if (key === "7" || key === "30") {
    start = new Date(date.getTime() - (Number(key) - 1) * day)
      .toISOString()
      .slice(0, 10);
    label = `Últimos ${key} dias`;
  } else if (key === "month") {
    start = today.slice(0, 7) + "-01";
    label = "Mês atual";
  } else if (key === "previous") {
    const first = new Date(today.slice(0, 7) + "-01T00:00:00Z");
    end = first.toISOString().slice(0, 10);
    first.setUTCMonth(first.getUTCMonth() - 1);
    start = first.toISOString().slice(0, 10);
    label = "Mês anterior";
  } else if (key === "custom") {
    if (
      !from ||
      !to ||
      !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
      !Number.isFinite(Date.parse(from)) ||
      !Number.isFinite(Date.parse(to)) ||
      new Date(from).toISOString().slice(0, 10) !== from ||
      new Date(to).toISOString().slice(0, 10) !== to ||
      from > to ||
      Date.parse(to) - Date.parse(from) > 365 * day
    )
      throw new Error("Informe um período válido de até 366 dias.");
    start = from;
    end = new Date(Date.parse(to) + day).toISOString().slice(0, 10);
    label = `${from} a ${to}`;
  } else if (!["today", "7", "30", "month", "previous"].includes(key))
    throw new Error("Período inválido.");
  const days = (Date.parse(end) - Date.parse(start)) / day;
  return {
    start: midnight(start, zone),
    end: midnight(end, zone),
    previousStart: midnight(
      new Date(Date.parse(start) - days * day).toISOString().slice(0, 10),
      zone,
    ),
    label,
  };
}
export function wilson(success: number, total: number) {
  if (!total) return [0, 1];
  const z = 1.96,
    p = success / total,
    d = 1 + (z * z) / total,
    c = (p + (z * z) / (2 * total)) / d,
    m =
      (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) /
      d;
  return [Math.max(0, c - m), Math.min(1, c + m)];
}
export function productionCost(product: Product) {
  const c = product.costs;
  if (c?.production !== undefined) return c.production;
  if (c?.ingredients !== undefined && c.additional !== undefined)
    return c.ingredients + c.additional;
  return null;
}
export type Recommendation = {
  id?: string;
  fingerprint: string;
  status?: "new" | "applied" | "ignored" | "resolved";
  version?: number;
  createdAt?: string;
  type: "presentation" | "exposure" | "pair" | "modifier" | "quiet" | "margin";
  title: string;
  message: string;
  evidence: string;
  productId?: string;
  relatedId?: string;
  modifierId?: string;
  action: "description" | "feature" | "pair" | "modifier" | "campaign";
  source: "production" | "demo";
  start: string;
  end: string;
  publicEnabled?: boolean;
  campaignText?: string;
  hour?: number;
};
export function analyzeCommerce(
  catalog: Catalog,
  allOrders: Order[],
  allEvents: CommercialEvent[],
  period: Period,
  config: ExperienceSettings,
  source: "production" | "demo",
  complete = true,
) {
  const matching = (o: Order) => o.dataMode === source;
  const orders = allOrders.filter(
      (o) =>
        matching(o) && o.createdAt >= period.start && o.createdAt < period.end,
    ),
    previous = allOrders.filter(
      (o) =>
        matching(o) &&
        o.createdAt >= period.previousStart &&
        o.createdAt < period.start,
    );
  const events = [
    ...new Map(
      allEvents
        .filter(
          (e) =>
            e.created_at >= period.start &&
            e.created_at < period.end &&
            e.metadata?.dataMode === source,
        )
        .map((e) => [e.id, e]),
    ).values(),
  ];
  const sessions = (type: string, pid?: string) =>
    new Set(
      events
        .filter((e) => e.type === type && (!pid || e.product_id === pid))
        .map((e) => e.session_id),
    );
  const buyers = new Set(
    orders.flatMap((o) =>
      [
        o.analyticsSessionId,
        ...o.items.map((i) => i.analyticsSessionId),
      ].filter((s): s is string => !!s),
    ),
  );
  const intersect = (a: Set<string>, b: Set<string>) =>
    [...a].filter((x) => b.has(x)).length;
  const delivered = orders.filter((o) => o.status === "delivered"),
    revenue = delivered.reduce((s, o) => s + o.total, 0),
    previousRevenue = previous
      .filter((o) => o.status === "delivered")
      .reduce((s, o) => s + o.total, 0);
  const products = catalog.products.map((p) => {
    const views = sessions("product_view", p.id),
      adds = sessions("add_to_cart", p.id),
      purchase = new Set(
        orders
          .filter((o) => o.items.some((i) => i.productId === p.id))
          .flatMap((o) =>
            [
              o.analyticsSessionId,
              ...o.items
                .filter((i) => i.productId === p.id)
                .map((i) => i.analyticsSessionId),
            ].filter((s): s is string => !!s),
          ),
      );
    const lines = orders.flatMap((o) =>
      o.items.filter((i) => i.productId === p.id),
    );
    const models = sessions("model_view", p.id),
      ars = sessions("ar_start", p.id);
    return {
      id: p.id,
      name: p.name,
      available: p.available,
      views: views.size,
      modelViews: models.size,
      arViews: ars.size,
      modelAdds: intersect(models, adds),
      arAdds: intersect(ars, adds),
      adds: intersect(views, adds),
      conversion: views.size ? intersect(views, adds) / views.size : null,
      purchaseConversion: views.size
        ? intersect(views, purchase) / views.size
        : null,
      quantity: lines.reduce((s, i) => s + i.quantity, 0),
      orderCount: orders.filter((o) =>
        o.items.some((i) => i.productId === p.id),
      ).length,
      value: lines.reduce((s, i) => s + i.total, 0),
      cost: productionCost(p),
      estimatedMargin:
        productionCost(p) === null ? null : p.price - productionCost(p)!,
      interval: wilson(intersect(views, adds), views.size),
    };
  });
  const categories = catalog.categories.map((c) => ({
    id: c.id,
    name: c.name,
    visits: sessions("category_view").size
      ? new Set(
          events
            .filter((e) => e.type === "category_view" && e.category_id === c.id)
            .map((e) => e.session_id),
        ).size
      : 0,
  }));
  const modifiers = new Map<
    string,
    {
      id: string;
      productId: string;
      name: string;
      quantity: number;
      orders: number;
    }
  >();
  for (const o of orders) {
    const seen = new Set<string>();
    for (const i of o.items)
      for (const m of i.modifiers) {
        const key = i.productId + ":" + m.id,
          row = modifiers.get(key) || {
            id: m.id,
            productId: i.productId,
            name: m.name,
            quantity: 0,
            orders: 0,
          };
        row.quantity += i.quantity;
        if (!seen.has(key)) {
          row.orders++;
          seen.add(key);
        }
        modifiers.set(key, row);
      }
  }
  const pairs: {
    a: string;
    b: string;
    count: number;
    support: number;
    lift: number;
  }[] = [];
  const pairCounts = new Map<string, { a: string; b: string; count: number }>();
  for (const o of orders) {
    const ids = [...new Set(o.items.map((i) => i.productId))].sort();
    for (let a = 0; a < ids.length; a++)
      for (let b = a + 1; b < ids.length; b++) {
        const key = JSON.stringify([ids[a], ids[b]]),
          row = pairCounts.get(key) || { a: ids[a], b: ids[b], count: 0 };
        row.count++;
        pairCounts.set(key, row);
      }
  }
  for (const pair of pairCounts.values()) {
    const x = products.find((p) => p.id === pair.a),
      y = products.find((p) => p.id === pair.b),
      count = pair.count;
    if (x && y)
      pairs.push({
        a: x.id,
        b: y.id,
        count,
        support: count / (orders.length || 1),
        lift:
          (count * (orders.length || 1)) / (x.orderCount * y.orderCount || 1),
      });
  }
  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0 }));
  const hourFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: catalog.settings.timezone,
    hour: "numeric",
    hourCycle: "h23",
  });
  for (const o of orders)
    hourly[Number(hourFormatter.format(new Date(o.createdAt)))].orders++;
  const daily = new Map<
    string,
    { date: string; orders: number; value: number; previous: number }
  >();
  for (
    let time = Date.parse(period.start);
    time < Date.parse(period.end);
    time += day
  ) {
    const date = calendar(
      new Date(time).toISOString(),
      catalog.settings.timezone,
    );
    daily.set(date, { date, orders: 0, value: 0, previous: 0 });
  }
  const shift = Date.parse(period.start) - Date.parse(period.previousStart);
  for (const o of orders) {
    const k = calendar(o.createdAt, catalog.settings.timezone),
      row = daily.get(k);
    if (row) {
      row.orders++;
      if (o.status === "delivered") row.value += o.total;
    }
  }
  for (const o of previous) {
    const k = calendar(
        new Date(Date.parse(o.createdAt) + shift).toISOString(),
        catalog.settings.timezone,
      ),
      row = daily.get(k);
    if (row && o.status === "delivered") row.previous += o.total;
  }
  const stages = [
    ["menu_open", "Acessaram o cardápio"],
    ["product_view", "Visualizaram produtos"],
    ["model_view", "Abriram o 3D"],
    ["ar_start", "Solicitaram AR"],
    ["add_to_cart", "Adicionaram ao carrinho"],
    ["order_confirmed", "Confirmaram pedidos"],
  ] as const;
  const funnel = stages.map(([type, label], index) => {
    const set = type === "order_confirmed" ? buyers : sessions(type),
      prior = index
        ? stages[index - 1][0] === "order_confirmed"
          ? buyers
          : sessions(stages[index - 1][0])
        : set;
    return {
      type,
      label,
      count: set.size,
      fromPrevious:
        index && prior.size ? intersect(prior, set) / prior.size : null,
    };
  });
  const added = sessions("add_to_cart"),
    three = sessions("model_view"),
    ar = sessions("ar_start");
  const dated = [
      ...orders.map((o) => o.createdAt),
      ...events.map((e) => e.created_at),
    ],
    observedDays = new Set(
      dated.map((d) => calendar(d, catalog.settings.timezone)),
    ).size;
  const sufficient =
    complete &&
    observedDays >= config.minAnalysisDays &&
    orders.length >= config.minRecommendationOrders;
  const recommendations: Recommendation[] = [];
  function recommend(
    r: Omit<Recommendation, "fingerprint" | "source" | "start" | "end">,
  ) {
    recommendations.push({
      ...r,
      fingerprint: [
        source,
        period.start,
        period.end,
        r.type,
        r.productId,
        r.relatedId,
        r.modifierId,
      ].join("|"),
      source,
      start: period.start,
      end: period.end,
    });
  }
  if (sufficient) {
    const eligible = products.filter(
        (p) => p.available && p.views >= config.minRecommendationViews,
      ),
      mean =
        eligible.reduce((s, p) => s + p.adds, 0) /
        (eligible.reduce((s, p) => s + p.views, 0) || 1),
      overall = wilson(
        eligible.reduce((s, p) => s + p.adds, 0),
        eligible.reduce((s, p) => s + p.views, 0),
      );
    for (const p of eligible) {
      if (p.interval[1] < overall[0])
        recommend({
          type: "presentation",
          title: "Muita atenção, poucas escolhas",
          message: `${p.name} recebeu ${p.views} visitantes e ${p.adds} adições por esses visitantes. Revise a descrição, a apresentação e o posicionamento do preço.`,
          evidence: `${p.views} sessões · conversão ${(100 * p.conversion!).toFixed(1)}% · intervalo Wilson 95% ${(100 * p.interval[0]).toFixed(1)}–${(100 * p.interval[1]).toFixed(1)}% · média ${(mean * 100).toFixed(1)}%`,
          productId: p.id,
          action: "description",
        });
      if (
        p.interval[0] > overall[1] &&
        p.views < Math.max(...eligible.map((x) => x.views)) * 0.6
      )
        recommend({
          type: "exposure",
          title: "Um bom produto pode aparecer mais",
          message: `${p.name} tem boa aceitação entre os visitantes, mas recebe menos visitas que os produtos mais vistos. Considere colocá-lo em destaque.`,
          evidence: `${p.views} visitantes · ${p.adds} adições · intervalo Wilson 95% ${(p.interval[0] * 100).toFixed(1)}–${(p.interval[1] * 100).toFixed(1)}%`,
          productId: p.id,
          action: "feature",
        });
    }
    for (const pair of pairs
      .filter((p) => p.count >= 10 && p.lift > 1.2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 4)) {
      const a = products.find((p) => p.id === pair.a)!,
        b = products.find((p) => p.id === pair.b)!;
      if (a.available && b.available)
        recommend({
          type: "pair",
          title: "Sabores que saem juntos",
          message: `${a.name} e ${b.name} apareceram juntos em ${pair.count} pedidos. Você pode publicar uma sugestão de acompanhamento, mantendo os preços atuais.`,
          evidence: `${orders.length} pedidos · suporte ${(pair.support * 100).toFixed(1)}% · lift ${pair.lift.toFixed(2)} · associação, sem evidência de causalidade`,
          productId: a.id,
          relatedId: b.id,
          action: "pair",
        });
    }
    for (const m of [...modifiers.values()]
      .filter((m) => m.orders >= 10)
      .slice(0, 4)) {
      const p = products.find((p) => p.id === m.productId)!;
      if (p.available && m.orders / p.orderCount >= 0.4)
        recommend({
          type: "modifier",
          title: "Um adicional que merece destaque",
          message: `${m.name} apareceu em ${m.orders} pedidos de ${p.name}. Considere sinalizá-lo na personalização.`,
          evidence: `${m.orders} de ${p.orderCount} pedidos do produto · ${m.quantity} unidades`,
          productId: p.id,
          modifierId: m.id,
          action: "modifier",
        });
    }
    const margins = products.filter(
      (p) => p.available && p.estimatedMargin !== null && p.quantity >= 10,
    );
    for (const p of margins
      .sort((a, b) => b.estimatedMargin! - a.estimatedMargin!)
      .slice(0, 1))
      if (p.estimatedMargin! > 0)
        recommend({
          type: "margin",
          title: "Margem estimada com demanda",
          message: `${p.name} teve ${p.quantity} unidades pedidas e possui custos cadastrados. Considere destacá-lo, avaliando também sua capacidade de produção.`,
          evidence: `${p.orderCount} pedidos · margem base estimada R$ ${(p.estimatedMargin! / 100).toFixed(2)} por unidade · não inclui custos variáveis de adicionais, impostos ou despesas não cadastradas`,
          productId: p.id,
          action: "feature",
        });
    const busy = hourly.filter((h) => h.orders > 0);
    if (busy.length >= 6) {
      const min = Math.min(...busy.map((h) => h.hour)),
        max = Math.max(...busy.map((h) => h.hour));
      const low = hourly
        .filter((h) => h.hour > min && h.hour < max)
        .sort((a, b) => a.orders - b.orders)[0];
      if (low && low.orders < (orders.length / (max - min + 1)) * 0.4)
        recommend({
          type: "quiet",
          title: "Uma faixa para experimentar uma campanha",
          message: `Às ${low.hour}h houve ${low.orders} pedidos no período. Avalie uma mensagem de campanha, considerando o horário real de funcionamento.`,
          evidence: `${orders.length} pedidos · ${observedDays.toFixed(0)} dias observados · não presume que a casa esteve aberta em todos os dias`,
          action: "campaign",
          hour: low.hour,
        });
    }
  }
  return {
    period,
    source,
    complete,
    revenue,
    previousRevenue,
    orderCount: orders.length,
    deliveredCount: delivered.length,
    ticket: delivered.length ? Math.round(revenue / delivered.length) : 0,
    products,
    categories,
    modifiers: [...modifiers.values()],
    pairs: pairs.sort((a, b) => b.count - a.count),
    hourly,
    daily: [...daily.values()],
    funnel,
    abandonment: added.size ? 1 - intersect(added, buyers) / added.size : null,
    modelConversion: three.size ? intersect(three, added) / three.size : null,
    arConversion: ar.size ? intersect(ar, added) / ar.size : null,
    modelSample: three.size,
    arSample: ar.size,
    trackedOrders: orders.filter(
      (o) => o.analyticsSessionId || o.items.some((i) => i.analyticsSessionId),
    ).length,
    legacyOrders: allOrders.filter(
      (o) =>
        !o.dataMode && o.createdAt >= period.start && o.createdAt < period.end,
    ).length,
    observedDays,
    sufficient,
    recommendations,
  };
}
export type CommerceReport = ReturnType<typeof analyzeCommerce> & {
  example?: boolean;
  recommendations: Recommendation[];
  actions?: {
    actor: string;
    action: string;
    created_at: string;
    recommendation_id: string;
  }[];
};
export function reviewInsights(reviews: Review[], lowRating: number) {
  const avg = (key: "food" | "service" | "wait") =>
    reviews.length
      ? reviews.reduce((s, r) => s + r[key], 0) / reviews.length
      : 0;
  const issues = new Map<string, number>();
  for (const r of reviews)
    for (const i of r.issues) issues.set(i, (issues.get(i) || 0) + 1);
  const alerts = reviews
    .filter(
      (r) =>
        r.status !== "resolved" &&
        (r.hasProblem ||
          r.issues.length > 0 ||
          Math.min(r.food, r.service, r.wait) <= lowRating),
    )
    .map((r) => ({
      key: r.id,
      message: `Avaliação com ${r.hasProblem ? "relato de problema" : "nota baixa"}`,
      count: 1,
      reviewId: r.id,
    }));
  const now = Date.now(),
    recent = reviews.filter((r) => Date.parse(r.createdAt) >= now - 7 * day),
    prior = reviews.filter(
      (r) =>
        Date.parse(r.createdAt) >= now - 14 * day &&
        Date.parse(r.createdAt) < now - 7 * day,
    );
  if (recent.length >= 10)
    for (const [issue] of issues) {
      const n = recent.filter((r) =>
        r.issues.includes(issue as Review["issues"][number]),
      ).length;
      if (n >= 3)
        alerts.push({
          key: "recurring-" + issue,
          message: `Problema recorrente: ${issue}`,
          count: n,
          reviewId: "",
        });
    }
  const mean = (list: Review[]) =>
    list.reduce((s, r) => s + (r.food + r.service + r.wait) / 3, 0) /
    (list.length || 1);
  if (
    recent.length >= 10 &&
    prior.length >= 10 &&
    mean(prior) - mean(recent) >= 0.5
  )
    alerts.push({
      key: "drop",
      message: `A média caiu de ${mean(prior).toFixed(1)} para ${mean(recent).toFixed(1)} entre as últimas duas semanas (${prior.length} e ${recent.length} avaliações).`,
      count: recent.length,
      reviewId: "",
    });
  return {
    count: reviews.length,
    food: avg("food"),
    service: avg("service"),
    wait: avg("wait"),
    overall: (avg("food") + avg("service") + avg("wait")) / 3,
    issues: [...issues].map(([issue, count]) => ({ issue, count })),
    alerts,
    recentSample: recent.length,
  };
}
