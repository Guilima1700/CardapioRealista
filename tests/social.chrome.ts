import { test, expect, type Page } from "@playwright/test";
test("Chrome: dois navegadores compartilham itens, cozinha entrega e cliente avalia", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180000);
  const host = await browser.newContext({
      baseURL,
      viewport: { width: 390, height: 844 },
    }),
    guest = await browser.newContext({
      baseURL,
      viewport: { width: 390, height: 844 },
    }),
    staff = await browser.newContext({
      baseURL,
      viewport: { width: 1440, height: 1000 },
    });
  const errors: string[] = [];
  const a = await host.newPage(),
    b = await guest.newPage();
  for (const page of [a, b])
    page.on("pageerror", (e) => errors.push(e.message));
  try {
    await staff.request.post("/api/auth", {
      data: { email: "admin@brasa.local", password: "Demo@2026!" },
    });
    const original = (
      await (await staff.request.get("/api/experience/settings")).json()
    ).config;
    await staff.request.post("/api/experience/settings", {
      data: {
        config: {
          ...original,
          dataMode: "demo",
          entryMode: "open",
          reviewDelayMinutes: 0,
          googleReviewUrl: "https://www.google.com/maps",
        },
      },
    });
    const table = "/mesa/9";
    async function join(page: Page, name: string) {
      await page.goto(table);
      await page
        .getByRole("button", {
          name: /Iniciar pedido coletivo|Entrar no pedido/,
        })
        .click();
      await page.getByLabel("Seu nome ou apelido").fill(name);
      await page
        .getByRole("button", { name: "Participar do pedido", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "A mesa de vocês." }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Continuar escolhendo no cardápio" })
        .click();
    }
    await join(a, "Lia");
    await join(b, "Caio");
    async function add(page: Page, product: string) {
      await page
        .getByRole("textbox", { name: "Pesquisar no cardápio" })
        .fill(product);
      await page
        .getByRole("button", { name: "Ver " + product, exact: true })
        .click();
      await page.getByRole("button", { name: /^Adicionar R\$/ }).click();
      await expect(
        page.getByRole("dialog", { name: "Personalizar " + product }),
      ).toBeHidden();
    }
    await Promise.all([add(a, "Brasa Classic"), add(b, "Coca-Cola")]);
    await a.getByRole("button", { name: /Pedido coletivo ·/ }).click();
    await b.getByRole("button", { name: /Pedido coletivo ·/ }).click();
    await expect(a.getByText("1× Coca-Cola", { exact: true })).toBeVisible();
    await expect(
      b.getByText("1× Brasa Classic", { exact: true }),
    ).toBeVisible();
    await expect(
      b.getByRole("button", { name: "Revisar pedido coletivo" }),
    ).toHaveCount(0);
    await b
      .getByRole("button", { name: "Aumentar Coca-Cola de Caio", exact: true })
      .click();
    await expect(a.getByText("2× Coca-Cola", { exact: true })).toBeVisible();
    await a.getByRole("button", { name: "Revisar pedido coletivo" }).click();
    await expect(
      b.getByText("Aguardando confirmação", { exact: true }),
    ).toBeVisible();
    await a
      .getByRole("button", { name: "Confirmar e enviar à cozinha" })
      .click();
    await expect(a).toHaveURL(/\/pedido\//);
    const token = a.url().split("/").at(-1)!;
    const order = await (await host.request.get("/api/orders/" + token)).json();
    expect(order.items.map((i: any) => i.participantName).sort()).toEqual([
      "Caio",
      "Lia",
    ]);
    const kitchen = await staff.newPage();
    await kitchen.goto("/cozinha");
    await expect(kitchen.getByText("Lia", { exact: true })).toBeVisible();
    await expect(kitchen.getByText("Caio", { exact: true })).toBeVisible();
    let version = order.version;
    for (const status of ["preparing", "ready", "delivered"]) {
      expect(
        (
          await staff.request.patch("/api/kitchen/" + order.id, {
            data: { status, version },
          })
        ).status(),
      ).toBe(200);
      version++;
    }
    await expect(
      a.getByRole("heading", { name: "Como foi o seu momento?" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      a.getByRole("link", { name: "Avaliar no Google" }),
    ).toBeVisible();
    for (const name of [
      "Qualidade da comida",
      "Atendimento",
      "Tempo de espera",
    ])
      await a
        .getByRole("radio", { name: name + ": 1 estrela", exact: true })
        .check();
    await a.getByLabel("Aconteceu algum problema").check();
    await a.getByLabel("Comida fria", { exact: true }).check();
    await a.getByLabel("Seu comentário").fill("[CHROME TESTE] Comida fria");
    await a
      .getByRole("button", { name: "Enviar avaliação", exact: true })
      .click();
    await expect(
      a.getByRole("heading", { name: "Obrigado por compartilhar." }),
    ).toBeVisible();
    await expect(
      a.getByRole("link", { name: "Avaliar no Google" }),
    ).toBeVisible();
    const admin = await staff.newPage();
    admin.on("pageerror", (e) => errors.push(e.message));
    await admin.goto("/admin");
    await admin
      .getByRole("button", { name: "Avaliações", exact: true })
      .click();
    await admin.getByLabel("Fonte de dados").selectOption("demo");
    await expect(
      admin.getByText("[CHROME TESTE] Comida fria", { exact: true }),
    ).toBeVisible();
    await admin
      .getByRole("button", { name: "Inteligência Comercial", exact: true })
      .click();
    await expect(
      admin.getByText(
        "Dados insuficientes para gerar recomendações confiáveis.",
        { exact: false },
      ),
    ).toBeVisible();
    await admin
      .getByRole("button", { name: "Ver exemplo ilustrativo separado" })
      .click();
    await expect(
      admin.getByText("EXEMPLO ILUSTRATIVO", { exact: false }),
    ).toBeVisible();
    await a.screenshot({
      path: "test-results/collective-review-mobile.png",
      fullPage: true,
    });
    await admin.screenshot({
      path: "test-results/commerce-admin.png",
      fullPage: true,
    });
    expect(errors).toEqual([]);
    await admin
      .getByRole("button", { name: "Pedidos coletivos", exact: true })
      .click();
    await expect(
      admin.getByRole("button", { name: "Encerrar sessão", exact: true }),
    ).toBeVisible();
    admin.once("dialog", (dialog) => void dialog.accept());
    await admin
      .getByRole("button", { name: "Encerrar sessão", exact: true })
      .click();
    await expect(
      admin.getByText("Nenhuma mesa em sessão", { exact: true }),
    ).toBeVisible();
    expect(
      (await (await host.request.get("/api/orders/" + token)).json()).status,
    ).toBe("delivered");
    await staff.request.post("/api/experience/settings", {
      data: { config: original },
    });
  } finally {
    await Promise.all([host.close(), guest.close(), staff.close()]);
  }
});
