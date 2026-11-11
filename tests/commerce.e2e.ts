import { test, expect, request } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { commercialPeriod } from "../src/lib/intelligence";
import { commerceExample } from "../src/lib/commerce-example";
test("inteligência usa dados persistidos separados e só aplica alteração confirmada", async ({
  baseURL,
}) => {
  const admin = await request.newContext({ baseURL }),
    guest = await request.newContext({ baseURL });
  await admin.post("/api/auth", {
    data: { email: "admin@brasa.local", password: "Demo@2026!" },
  });
  const catalog = (await (await admin.get("/api/admin")).json()).catalog,
    config = (await (await admin.get("/api/experience/settings")).json())
      .config;
  const empty = await (
    await admin.get("/api/experience/commerce?period=30")
  ).json();
  expect(empty.sufficient).toBe(false);
  expect(empty.recommendations).toHaveLength(0);
  expect((await guest.get("/api/experience/commerce")).status()).toBe(401);
  const example = await (
    await admin.get("/api/experience/commerce?period=30&example=1")
  ).json();
  expect(example.example).toBe(true);
  expect(example.recommendations.some((r: any) => r.type === "pair")).toBe(
    true,
  );
  const db = new DatabaseSync(
    path.resolve(process.env.BRASA_TEST_DATA_DIR!, "brasa.sqlite"),
  );
  try {
    const sample = commerceExample(
      catalog,
      commercialPeriod("30", catalog.settings.timezone),
    );
    db.exec("BEGIN IMMEDIATE");
    for (const fixture of sample.orders) {
      const id = randomUUID(),
        o = {
          ...fixture,
          id,
          trackingToken: randomUUID(),
          idempotencyKey: randomUUID(),
          number: 10000 + fixture.number,
        };
      db.prepare("INSERT INTO orders VALUES(?,?,?,?,?,?,?,?,?)").run(
        o.id,
        o.number,
        o.trackingToken,
        o.idempotencyKey,
        o.tableId,
        o.status,
        o.version,
        o.createdAt,
        JSON.stringify(o),
      );
    }
    for (const e of sample.events)
      db.prepare(
        "INSERT INTO analytics_events(id,type,product_id,category_id,session_id,created_at,metadata,verified) VALUES(?,?,?,?,?,?,?,0)",
      ).run(
        randomUUID(),
        e.type,
        e.product_id || null,
        null,
        e.session_id,
        e.created_at,
        JSON.stringify(e.metadata),
      );
    db.exec("COMMIT");
    const real = await (
      await admin.get("/api/experience/commerce?period=30")
    ).json();
    expect(real.orderCount).toBe(0);
    const report = await (
      await admin.get("/api/experience/commerce?period=30&source=demo")
    ).json();
    expect(report.orderCount).toBe(280);
    expect(report.sufficient).toBe(true);
    const rec = report.recommendations.find((r: any) => r.action === "pair");
    expect(rec).toBeTruthy();
    expect(rec.id).toBeTruthy();
    expect(
      (
        await guest.post("/api/experience/commerce", {
          data: {
            id: rec.id,
            version: 1,
            mutationId: randomUUID(),
            action: "apply",
            confirmed: true,
          },
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await admin.post("/api/experience/commerce", {
          data: {
            id: rec.id,
            version: 1,
            mutationId: randomUUID(),
            action: "apply",
          },
        })
      ).status(),
    ).toBe(409);
    await admin.post("/api/experience/settings", {
      data: { config: { ...config, dataMode: "demo" } },
    });
    const mutationId = randomUUID();
    const input = {
      id: rec.id,
      version: 1,
      mutationId,
      action: "apply",
      confirmed: true,
    };
    expect(
      (await admin.post("/api/experience/commerce", { data: input })).status(),
    ).toBe(200);
    expect(
      (await admin.post("/api/experience/commerce", { data: input })).status(),
    ).toBe(200);
    const suggestions = await (await guest.get("/api/recommendations")).json();
    expect(suggestions.some((s: any) => s.id === rec.id)).toBe(true);
    const changed = await (
      await admin.get("/api/experience/commerce?period=30&source=demo")
    ).json();
    expect(
      changed.actions.filter((a: any) => a.recommendation_id === rec.id),
    ).toHaveLength(1);
    const oldPrice = catalog.products.find(
      (p: any) => p.id === rec.productId,
    ).price;
    expect(
      (await (await guest.get("/api/catalog")).json()).products.find(
        (p: any) => p.id === rec.productId,
      ).price,
    ).toBe(oldPrice);
    expect(
      (
        await admin.post("/api/experience/commerce", {
          data: {
            id: rec.id,
            version: 1,
            mutationId: randomUUID(),
            action: "ignore",
          },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await admin.post("/api/experience/commerce", {
          data: {
            id: rec.id,
            version: 2,
            mutationId: randomUUID(),
            action: "disable",
          },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await (await guest.get("/api/recommendations")).json()).some(
        (s: any) => s.id === rec.id,
      ),
    ).toBe(false);
    const next = changed.recommendations.find((r: any) => r.id !== rec.id);
    if (next) {
      expect(
        (
          await admin.post("/api/experience/commerce", {
            data: {
              id: next.id,
              version: 1,
              mutationId: randomUUID(),
              action: "ignore",
            },
          })
        ).status(),
      ).toBe(200);
    }
    // Evidence is revalidated before applying: remove the required sample from this
    // isolated fixture database only; an old admin screen must not apply it.
    db.prepare("UPDATE orders SET data=json_set(data,'$.dataMode','production') WHERE number>=10000").run();
    expect((await admin.post('/api/experience/commerce',{data:{id:rec.id,version:3,mutationId:randomUUID(),action:'apply',confirmed:true}})).status()).toBe(409);
  } finally {
    db.close();
    await admin.post("/api/experience/settings", { data: { config } });
    await admin.dispose();
    await guest.dispose();
  }
});
