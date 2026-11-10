import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const menu = "/?mesa=brasa-mesa-7-demo";
async function openClassic(page: Page) {
  await page.goto(menu);
  await page
    .getByRole("button", { name: "Ver Brasa Classic", exact: true })
    .click();
  await expect(page.locator("[data-model-state]")).toHaveAttribute(
    "data-model-state",
    "ready",
    { timeout: 60000 },
  );
}
async function login(page: Page) {
  await page.goto("/equipe");
  await page
    .getByRole("textbox", { name: "E-mail", exact: true })
    .fill("admin@brasa.local");
  await page
    .getByRole("textbox", { name: "Senha", exact: true })
    .fill("Demo@2026!");
  const authenticated = page.waitForResponse(
    (r) => r.url().endsWith("/api/auth") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  expect((await authenticated).status()).toBe(200);
  await expect(page).toHaveURL(/\/admin$/, { timeout: 20000 });
}
test.describe.serial("Google Chrome instalado, banco isolado", () => {
  test("modais permanecem visíveis com CSS genérico, rolagem e diferentes telas", async ({
    page,
  }) => {
    for (const viewport of [
      { width: 1920, height: 945 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(menu);
      // Reproduce a host/extension stylesheet hiding a generic modal selector.
      await page.addStyleTag({
        content: ".modal { display: none !important; }",
      });
      await page
        .getByRole("button", { name: "Ver Brasa Classic", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Personalizar Brasa Classic",
      });
      await expect(dialog).toBeInViewport();
      await expect(
        dialog.getByRole("heading", { name: "Brasa Classic." }),
      ).toBeVisible();
      await dialog.getByRole("radio", { name: /Australiano/ }).check();
      await dialog
        .getByRole("button", { name: "Adicionar R$ 34,90", exact: true })
        .click();
      await page
        .getByRole("button", { name: /Abrir sacola, \d+ itens/, exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeInViewport();
      await expect(
        page.getByRole("dialog").getByText("Australiano", { exact: false }).first(),
      ).toBeVisible();
      await page.getByRole("button", { name: "Fechar", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.getByRole("button", { name: "Mesa 07", exact: true }).click();
      await expect(page.getByRole("dialog")).toBeInViewport();
      await page.getByRole("button", { name: "Fechar", exact: true }).click();
    }
  });
  test("controles SSR aguardam hidratação antes de aceitar cliques", async ({
    page,
  }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/_next/static/**/*.js", async (route) => {
      await gate;
      await route.continue();
    });
    try {
      await page.goto(menu, { waitUntil: "commit" });
      await expect(
        page.getByRole("button", { name: "Ver Brasa Classic", exact: true }),
      ).toBeDisabled();
    } finally {
      release();
    }
    await page
      .getByRole("button", { name: "Ver Brasa Classic", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
  test("favoritos inválidos não derrubam React; categorias e busca funcionam", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() =>
      localStorage.setItem("brasa_favorites", "{}"),
    );
    await page.goto(menu);
    await page.getByRole("tab", { name: /Bebidas/ }).click();
    await expect(
      page.getByRole("button", { name: "Ver Coca-Cola", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Pesquisar no cardápio" })
      .fill("Classic");
    await page
      .getByRole("button", {
        name: "Salvar Brasa Classic nos favoritos",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Remover Brasa Classic nos favoritos",
        exact: true,
      }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
  test("3D, gestos, escala, fallback AR e Escape preservam o produto", async ({
    page,
  }) => {
    await openClassic(page);
    const el = page.locator("model-viewer");
    expect(
      await el.evaluate((e: any) => ({
        loaded: e.loaded,
        controls: e.cameraControls,
        ar: e.ar,
        scale: e.getDimensions().x,
      })),
    ).toMatchObject({ loaded: true, controls: true, ar: true });
    await expect(
      page.getByRole("button", { name: "Ver na minha mesa", exact: true }),
    ).toBeDisabled();
    const b = (await el.boundingBox())!;
    await page.mouse.move(b.x + b.width * 0.4, b.y + b.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.7, b.y + b.height * 0.5, {
      steps: 10,
    });
    await page.mouse.up();
    await expect(el).not.toHaveAttribute("auto-rotate");
    await page.getByRole("button", { name: "Restaurar enquadramento" }).click();
    await expect(el).toHaveAttribute("auto-rotate", "");
    await page
      .getByRole("button", { name: "Abrir modelo em tela cheia" })
      .click();
    await expect
      .poll(() => page.evaluate(() => !!document.fullscreenElement))
      .toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => !!document.fullscreenElement))
      .toBe(false);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
  test("upload GLTF, prévia, publicação e erro de GLB ausente", async ({
    page,
  }) => {
    await login(page);
    await page.getByRole("button", { name: "Modelos 3D", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Buscar produtos" })
      .fill("Brasa Classic");
    await page
      .getByRole("button", { name: "Gerenciar arquivos", exact: true })
      .click();
    const bytes = readFileSync("public/models/brasa-classic.glb"),
      length = bytes.readUInt32LE(12),
      doc = JSON.parse(bytes.toString("utf8", 20, 20 + length).trim()),
      offset = 20 + length;
    doc.buffers[0].uri =
      "data:application/octet-stream;base64," +
      bytes
        .subarray(offset + 8, offset + 8 + bytes.readUInt32LE(offset))
        .toString("base64");
    const uploaded = page.waitForResponse((r) =>
      r.url().endsWith("/api/uploads"),
    );
    await page.getByLabel("Enviar Modelo 3D", { exact: true }).setInputFiles({
      name: "browser-embedded.gltf",
      mimeType: "model/gltf+json",
      buffer: Buffer.from(JSON.stringify(doc)),
    });
    const response = await uploaded;
    expect(response.status()).toBe(200);
    const asset = await response.json();
    await expect(
      page.getByRole("textbox", { name: "Modelo 3D", exact: true }),
    ).toHaveValue(asset.url);
    await expect(page.locator("[data-model-state]")).toHaveAttribute(
      "data-model-state",
      "ready",
    );
    await page
      .getByRole("button", { name: "Salvar produto", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(
      (await (await page.request.get("/api/catalog")).json()).products.find(
        (p: { id: string }) => p.id === "brasa-classic",
      ).modelUrl,
    ).toBe(asset.url);
    await page
      .getByRole("button", { name: "Gerenciar arquivos", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Modelo 3D", exact: true })
      .fill("/models/intentionally-missing.glb");
    await page
      .getByRole("button", { name: "Carregar prévia", exact: true })
      .click();
    await expect(page.locator("[data-model-state]")).toHaveAttribute(
      "data-model-state",
      "error",
    );
    await page
      .getByRole("button", { name: "Salvar produto", exact: true })
      .click();
    await expect(
      page.getByText(
        "Carregue e confira a prévia do novo modelo antes de publicar.",
      ),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  });
  test("pedido com storage bloqueado e resposta perdida mantém idempotência", async ({
    page,
  }) => {
    await page.addInitScript(() =>
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException(
            "Storage blocked by browser test",
            "SecurityError",
          );
        },
      }),
    );
    await openClassic(page);
    await page.getByRole("checkbox", { name: /Bacon crocante/ }).check();
    await page
      .getByRole("textbox", { name: /Alguma observação/ })
      .fill("[CHROME TEST] Sem tomate");
    await page
      .getByRole("button", { name: "Adicionar R$ 38,90", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Abrir sacola, 1 itens", exact: true })
      .click();
    await expect(
      page.getByText(/Seu navegador não permite salvar a sacola/),
    ).toBeVisible();
    const keys: string[] = [];
    let first = true;
    await page.route("**/api/orders", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      keys.push(route.request().postDataJSON().idempotencyKey);
      if (first) {
        first = false;
        await route.fetch();
        await route.abort("failed");
      } else await route.continue();
    });
    await page
      .getByRole("button", { name: "Confirmar e enviar pedido", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Confirmar e enviar pedido",
        exact: true,
      }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Confirmar e enviar pedido", exact: true })
      .click();
    await expect(page).toHaveURL(/\/pedido\//);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    await expect(page.getByText("Total", { exact: true })).toBeVisible();
    await page.request.post("/api/auth", {
      data: { email: "admin@brasa.local", password: "Demo@2026!" },
    });
    const orders = await (await page.request.get("/api/orders")).json();
    expect(
      orders.filter(
        (o: { idempotencyKey: string }) => o.idempotencyKey === keys[0],
      ),
    ).toHaveLength(1);
    expect(
      orders.find(
        (o: { idempotencyKey: string }) => o.idempotencyKey === keys[0],
      ).total,
    ).toBe(3890);
  });
  test("cozinha e acompanhamento atualizam; fuso diferente não quebra hidratação", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await browser.newContext({
        baseURL,
        timezoneId: "Pacific/Auckland",
      }),
      customer = await ctx.newPage(),
      kitchen = await ctx.newPage(),
      hydration: string[] = [];
    for (const p of [customer, kitchen]) {
      p.on("pageerror", (e) => hydration.push(e.message));
      p.on("console", (m) => {
        if (m.type() === "error" && /hydration|hydrated|#418/i.test(m.text()))
          hydration.push(m.text());
      });
    }
    await ctx.request.post("/api/auth", {
      data: { email: "admin@brasa.local", password: "Demo@2026!" },
    });
    const created = await ctx.request.post("/api/orders", {
      data: {
        tableToken: "brasa-mesa-8-demo",
        idempotencyKey: crypto.randomUUID(),
        payment: "cashier",
        items: [
          {
            productId: "brasa-classic",
            quantity: 1,
            modifierIds: ["brioche", "medium"],
            notes: "[CHROME LIVE]",
          },
        ],
      },
    });
    expect(created.status()).toBe(200);
    const liveOrder = await created.json();
    // Compile this dynamic route before opening the live pages in next dev.
    expect(
      (
        await ctx.request.patch("/api/kitchen/chrome-warmup", {
          data: { status: "preparing", version: 1 },
        })
      ).status(),
    ).toBe(404);
    await customer.goto("/pedido/" + liveOrder.trackingToken);
    await kitchen.goto("/cozinha");
    await kitchen.bringToFront();
    await kitchen.waitForResponse(
      (r) => r.url().endsWith("/api/orders") && r.ok(),
    );
    const card = kitchen
      .getByRole("article")
      .filter({ hasText: "[CHROME LIVE]" });
    const prepared = kitchen.waitForResponse(
      (r) =>
        r.url().includes("/api/kitchen/") && r.request().method() === "PATCH",
      { timeout: 15000 },
    );
    await card
      .getByRole("button", { name: "Começar preparo", exact: true })
      .click();
    const mutation = await prepared;
    expect(mutation.status(), await mutation.text()).toBe(200);
    expect(
      (
        await (
          await ctx.request.get("/api/orders/" + liveOrder.trackingToken)
        ).json()
      ).status,
    ).toBe("preparing");
    await customer.bringToFront();
    await expect(
      customer.getByRole("heading", {
        name: "Tem coisa boa na cozinha.",
        exact: true,
      }),
    ).toBeVisible({ timeout: 15000 });
    await card
      .getByRole("button", { name: "Marcar como pronto", exact: true })
      .click();
    await card
      .getByRole("button", { name: "Confirmar entrega", exact: true })
      .click();
    await customer.bringToFront();
    await expect(
      customer.getByRole("heading", { name: "Agora é com você.", exact: true }),
    ).toBeVisible({ timeout: 15000 });
    expect(hydration).toEqual([]);
    await ctx.close();
  });
});
