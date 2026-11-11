import { test, expect, type APIRequestContext } from "@playwright/test";
import type { Catalog, Order } from "../src/lib/types";
test.describe.serial("API de ponta a ponta com banco isolado", () => {
  let staff: APIRequestContext,
    guest: APIRequestContext,
    catalog: Catalog,
    order: Order;
  const payload = {
    tableToken: "brasa-mesa-7-demo",
    idempotencyKey: crypto.randomUUID(),
    payment: "cashier",
    items: [
      {
        productId: "brasa-classic",
        quantity: 2,
        modifierIds: ["brioche", "medium", "bacon"],
        notes: "Sem tomate — atenção na montagem",
        unitPrice: 1,
        total: 1,
      },
    ],
  };
  test.beforeAll(async ({ playwright }) => {
    staff = await playwright.request.newContext({
      baseURL: "http://127.0.0.1:3100",
    });
    guest = await playwright.request.newContext({
      baseURL: "http://127.0.0.1:3100",
    });
    const login = await staff.post("/api/auth", {
      data: { email: "admin@brasa.local", password: "Demo@2026!" },
    });
    expect(login.ok()).toBeTruthy();
    catalog = (await (await staff.get("/api/admin")).json()).catalog;
  });
  test.afterAll(async () => {
    await staff?.dispose();
    await guest?.dispose();
  });
  test("público lê cardápio e só a mesa solicitada; gestão exige autenticação", async () => {
    const result = await (await guest.get("/api/catalog")).json();
    expect(result.tables).toHaveLength(0);
    expect(result.products.length).toBeGreaterThan(0);
    expect((await guest.get("/api/admin")).status()).toBe(401);
    expect((await guest.get("/api/orders")).status()).toBe(401);
    const scoped = await (
      await guest.get("/api/catalog?mesa=brasa-mesa-7-demo")
    ).json();
    expect(scoped.tables).toHaveLength(1);
  });
  test("modelo é publicado no produto original e gerenciamento exige administrador", async () => {
    expect(
      (await guest.get("/api/assets?productId=brasa-classic")).status(),
    ).toBe(401);
    const bytes = await (await guest.get("/models/brasa-classic.glb")).body();
    const upload = await staff.post("/api/uploads", {
      multipart: {
        productId: "brasa-classic",
        productName: "Brasa Classic",
        widthCm: "22",
        file: {
          name: "classic.glb",
          mimeType: "model/gltf-binary",
          buffer: bytes,
        },
      },
    });
    expect(upload.ok(), await upload.text()).toBeTruthy();
    const asset = await upload.json();
    expect(asset.dimensions.widthCm).toBeCloseTo(22);
    const product = {
      ...catalog.products.find((p) => p.id === "brasa-classic")!,
      modelUrl: asset.url,
      modelAssetId: asset.id,
      model3dEnabled: true,
      arEnabled: true,
    };
    expect(
      (
        await staff.post("/api/admin", {
          data: { action: "product", data: product },
        })
      ).ok(),
    ).toBeTruthy();
    const visible = (
      await (await guest.get("/api/catalog")).json()
    ).products.find((p: { id: string }) => p.id === product.id);
    expect(visible.modelUrl).toBe(asset.url);
    expect(visible.price).toBe(product.price);
    expect(
      (await staff.get("/api/assets?productId=brasa-classic")).ok(),
    ).toBeTruthy();
    expect((await staff.delete(`/api/assets/${asset.id}`)).status()).toBe(409);
    const another = {
      ...catalog.products.find((p) => p.id !== "brasa-classic")!,
      modelUrl: asset.url,
      modelAssetId: asset.id,
    };
    expect(
      (
        await staff.post("/api/admin", {
          data: { action: "product", data: another },
        })
      ).status(),
    ).toBe(409);
  });
  test("pedido calcula preços reais e tentativas simultâneas não duplicam", async () => {
    const responses = await Promise.all([
      guest.post("/api/orders", { data: payload }),
      guest.post("/api/orders", { data: payload }),
    ]);
    for (const response of responses)
      expect(response.ok(), await response.text()).toBeTruthy();
    order = await responses[0].json();
    const retry: Order = await responses[1].json();
    expect(order.total).toBe(7780);
    expect(order.status).toBe("confirmed");
    expect(retry.id).toBe(order.id);
    const orders: Order[] = await (await staff.get("/api/orders")).json();
    expect(
      orders.filter((o) => o.idempotencyKey === payload.idempotencyKey),
    ).toHaveLength(1);
  });
  test("mesa inválida, adicionais inválidos e origens externas são rejeitados", async () => {
    expect(
      (
        await guest.post("/api/orders", {
          data: {
            ...payload,
            idempotencyKey: crypto.randomUUID(),
            tableToken: "unknown",
          },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await guest.post("/api/orders", {
          data: {
            ...payload,
            idempotencyKey: crypto.randomUUID(),
            items: [
              {
                ...payload.items[0],
                modifierIds: ["brioche", "medium", "forged"],
              },
            ],
          },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await guest.post("/api/orders", {
          headers: { origin: "https://evil.example" },
          data: payload,
        })
      ).status(),
    ).toBe(403);
  });
  test("cozinha avança status; versão antiga e saltos são rejeitados; cliente acompanha", async () => {
    expect(
      (
        await guest.patch(`/api/kitchen/${order.id}`, {
          data: { status: "preparing", version: 1 },
        })
      ).status(),
    ).toBe(401);
    const prepared = await staff.patch(`/api/kitchen/${order.id}`, {
      data: { status: "preparing", version: 1 },
    });
    expect(prepared.ok()).toBeTruthy();
    expect(
      (
        await staff.patch(`/api/kitchen/${order.id}`, {
          data: { status: "ready", version: 1 },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await staff.patch(`/api/kitchen/${order.id}`, {
          data: { status: "delivered", version: 2 },
        })
      ).status(),
    ).toBe(409);
    const ready = await staff.patch(`/api/kitchen/${order.id}`, {
      data: { status: "ready", version: 2 },
    });
    expect(ready.ok()).toBeTruthy();
    const delivered = await staff.patch(`/api/kitchen/${order.id}`, {
      data: { status: "delivered", version: 3 },
    });
    expect(delivered.ok()).toBeTruthy();
    const tracked: Order = await (
      await guest.get(`/api/orders/${order.trackingToken}`)
    ).json();
    expect(tracked.status).toBe("delivered");
    expect(tracked.history.map((h) => h.status)).toEqual([
      "received",
      "confirmed",
      "preparing",
      "ready",
      "delivered",
    ]);
    expect((await guest.get("/api/orders/not-an-order")).status()).toBe(404);
  });
  test("gestão altera preços e disponibilidade no catálogo persistido", async () => {
    const p = { ...catalog.products[0], price: 3990, available: false };
    expect(
      (
        await staff.post("/api/admin", { data: { action: "product", data: p } })
      ).ok(),
    ).toBeTruthy();
    const publicCatalog = await (await guest.get("/api/catalog")).json();
    expect(
      publicCatalog.products.some((x: { id: string }) => x.id === p.id),
    ).toBeFalsy();
    expect(
      (
        await guest.post("/api/orders", {
          data: { ...payload, idempotencyKey: crypto.randomUUID() },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await staff.post("/api/admin", {
          data: { action: "product", data: catalog.products[0] },
        })
      ).ok(),
    ).toBeTruthy();
  });
  test("upload protegido aceita GLB real, rejeita executável e serve arquivo salvo", async () => {
    expect(
      (
        await guest.post("/api/uploads", {
          multipart: {
            file: {
              name: "fake.glb",
              mimeType: "model/gltf-binary",
              buffer: Buffer.from("fake"),
            },
          },
        })
      ).status(),
    ).toBe(401);
    const fake = await staff.post("/api/uploads", {
      multipart: {
        file: {
          name: "fake.glb",
          mimeType: "model/gltf-binary",
          buffer: Buffer.from("MZ fake binary"),
        },
      },
    });
    expect(fake.status()).toBe(400);
    const glb = await (await guest.get("/models/brasa-classic.glb")).body();
    const upload = await staff.post("/api/uploads", {
      multipart: {
        file: {
          name: "burger.glb",
          mimeType: "model/gltf-binary",
          buffer: glb,
        },
      },
    });
    expect(upload.ok(), await upload.text()).toBeTruthy();
    const { url } = await upload.json();
    const file = await guest.get(url);
    expect(file.ok()).toBeTruthy();
    expect((await file.body()).subarray(0, 4).toString()).toBe("glTF");
  });
  test("relatórios contam apenas pedidos e eventos registrados", async () => {
    const sessionId = crypto.randomUUID();
    expect(
      (
        await guest.post("/api/analytics", {
          data: { type: "model_view", productId: "brasa-classic", sessionId },
        })
      ).ok(),
    ).toBeTruthy();
    const data = await (await staff.get("/api/admin?days=1")).json();
    const matching = data.orders.filter((o: {id:string}) => o.id === order.id);
    expect(matching).toHaveLength(1);
    expect(matching[0].total).toBe(7780);
    expect(
      data.events.filter(
        (e: { session_id: string }) => e.session_id === sessionId,
      ),
    ).toHaveLength(1);
  });
  test("funcionário de cozinha acessa pedidos e não acessa gestão", async () => {
    const email = `kitchen-${Date.now()}@brasa.local`;
    expect(
      (
        await staff.post("/api/admin", {
          data: {
            action: "staff",
            data: { email, password: "Kitchen-test-2026!", role: "kitchen" },
          },
        })
      ).ok(),
    ).toBeTruthy();
    expect(
      (
        await guest.post("/api/auth", {
          data: { email, password: "Kitchen-test-2026!" },
        })
      ).ok(),
    ).toBeTruthy();
    expect((await guest.get("/api/orders")).status()).toBe(200);
    expect((await guest.get("/api/admin")).status()).toBe(403);
    expect(
      (
        await guest.post("/api/admin", {
          data: { action: "settings", data: catalog.settings },
        })
      ).status(),
    ).toBe(403);
  });
  test("modo de confirmação manual e bloqueio de pedidos funcionam", async () => {
    expect(
      (
        await staff.post("/api/admin", {
          data: {
            action: "settings",
            data: { ...catalog.settings, sendImmediately: false },
          },
        })
      ).ok(),
    ).toBeTruthy();
    const manual: Order = await (
      await guest.post("/api/orders", {
        data: { ...payload, idempotencyKey: crypto.randomUUID() },
      })
    ).json();
    expect(manual.status).toBe("received");
    expect(
      (
        await staff.post("/api/admin", {
          data: {
            action: "settings",
            data: { ...catalog.settings, open: false },
          },
        })
      ).ok(),
    ).toBeTruthy();
    expect(
      (
        await guest.post("/api/orders", {
          data: { ...payload, idempotencyKey: crypto.randomUUID() },
        })
      ).status(),
    ).toBe(409);
  });
});
