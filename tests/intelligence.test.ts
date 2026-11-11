import { test } from "node:test";
import assert from "node:assert/strict";
import { seed } from "../src/lib/seed";
import {
  analyzeCommerce,
  commercialPeriod,
  wilson,
  productionCost,
  reviewInsights,
} from "../src/lib/intelligence";
import { defaultExperienceSettings } from "../src/lib/experiences";
import { commerceExample } from "../src/lib/commerce-example";
import { publicCatalog } from "../src/lib/public-catalog";
import type { Catalog } from "../src/lib/types";
const catalog = { ...seed, backend: "sqlite" } as Catalog;
test("custos administrativos não chegam ao catálogo público", () => {
  const copy = structuredClone(catalog);
  copy.products[0].costs = { production: 1500 };
  const value = publicCatalog(copy);
  assert.equal(value.products[0].costs, undefined);
  assert.equal(copy.products[0].costs?.production, 1500);
});
test("períodos respeitam o fuso da casa e rejeitam datas impossíveis", () => {
  const p = commercialPeriod(
    "today",
    "America/Sao_Paulo",
    undefined,
    undefined,
    new Date("2026-11-10T01:00:00Z"),
  );
  assert.equal(p.start, "2026-11-09T03:00:00.000Z");
  assert.equal(p.end, "2026-11-10T03:00:00.000Z");
  assert.throws(() =>
    commercialPeriod("custom", "UTC", "2026-02-31", "2026-03-03"),
  );
  assert.equal(
    commercialPeriod(
      "previous",
      "UTC",
      undefined,
      undefined,
      new Date("2026-01-12"),
    ).start,
    "2025-12-01T00:00:00.000Z",
  );
});
test("custos desconhecidos não viram lucro e custo total não é somado duas vezes", () => {
  const p = catalog.products[0];
  assert.equal(productionCost({ ...p, costs: undefined }), null);
  assert.equal(productionCost({ ...p, costs: { ingredients: 100 } }), null);
  assert.equal(
    productionCost({
      ...p,
      costs: { production: 100, ingredients: 80, additional: 20 },
    }),
    100,
  );
  assert.equal(
    productionCost({ ...p, costs: { ingredients: 80, additional: 20 } }),
    100,
  );
});
test("análise sem amostra não inventa recomendações nem taxas", () => {
  const p = commercialPeriod("30", "UTC");
  const r = analyzeCommerce(
    catalog,
    [],
    [],
    p,
    defaultExperienceSettings,
    "production",
  );
  assert.equal(r.revenue, 0);
  assert.equal(r.abandonment, null);
  assert.equal(r.sufficient, false);
  assert.deepEqual(r.recommendations, []);
});
test("demonstração é separada, eventos duplicados não inflam métricas, regras usam amostra", () => {
  const period = commercialPeriod("30", "UTC"),
    sample = commerceExample(catalog, period);
  const real = analyzeCommerce(
    catalog,
    sample.orders,
    sample.events,
    period,
    defaultExperienceSettings,
    "production",
  );
  assert.equal(real.revenue, 0);
  const demo = analyzeCommerce(
    catalog,
    sample.orders,
    [...sample.events, ...sample.events],
    period,
    defaultExperienceSettings,
    "demo",
  );
  assert.equal(demo.orderCount, 280);
  assert.equal(demo.sufficient, true);
  assert.equal(demo.products[0].views, 420);
  assert.ok(demo.recommendations.some((r) => r.type === "pair"));
  assert.ok(
    demo.recommendations.every((r) => r.evidence && r.source === "demo"),
  );
  assert.ok(
    demo.funnel.every((f) => f.fromPrevious === null || f.fromPrevious <= 1),
  );
  assert.ok(wilson(10, 10)[0] > 0.7);
});
test("alertas de recorrência exigem amostra suficiente", () => {
  const make = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: String(i),
      orderId: String(i),
      tableId: "table-1",
      createdAt: new Date().toISOString(),
      food: 5,
      service: 5,
      wait: 5,
      issues: ["preparation_delay" as const],
      hasProblem: false,
      comment: "",
      suggestion: "",
      status: "new" as const,
      version: 1,
    }));
  assert.equal(
    reviewInsights(make(3), 2).alerts.filter((a) =>
      a.key.startsWith("recurring-"),
    ).length,
    0,
  );
  assert.ok(
    reviewInsights(make(10), 2).alerts.some(
      (a) => a.key === "recurring-preparation_delay",
    ),
  );
});
