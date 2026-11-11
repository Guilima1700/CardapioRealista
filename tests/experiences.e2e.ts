import {
  test,
  expect,
  request,
  type APIRequestContext,
} from "@playwright/test";
const creds = { email: "admin@brasa.local", password: "Demo@2026!" };
test("PIN, aprovação de funcionário, expiração e credencial antiga", async ({
  baseURL,
}) => {
  const a = await request.newContext({ baseURL }),
    b = await request.newContext({ baseURL }),
    staff = await request.newContext({ baseURL });
  await staff.post("/api/auth", { data: creds });
  const original = (await (await staff.get("/api/experience/settings")).json())
    .config;
  const line = { productId: "cola", quantity: 1, modifierIds: [], notes: "" };
  try {
    await staff.post("/api/experience/settings", {
      data: { config: { ...original, entryMode: "pin" }, pin: "SenhaMesa2026" },
    });
    const path = "/api/tables/table-8/group";
    expect(
      (
        await a.post(path, {
          data: { action: "join", name: "A", pin: "errada" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await a.post(path, {
          data: { action: "join", name: "A", pin: "SenhaMesa2026" },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await b.post(path, {
          data: { action: "join", name: "B", pin: "SenhaMesa2026" },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await a.post(path, {
          data: { action: "close", mutationId: crypto.randomUUID() },
        })
      ).status(),
    ).toBe(200);
    await a.post(path, {
      data: { action: "join", name: "Novo", pin: "SenhaMesa2026" },
    });
    expect(
      (
        await b.post(path, {
          data: { action: "add", mutationId: crypto.randomUUID(), item: line },
        })
      ).status(),
    ).toBe(401);
    await a.post(path, {
      data: { action: "close", mutationId: crypto.randomUUID() },
    });
    await staff.post("/api/experience/settings", {
      data: { config: { ...original, entryMode: "approval" } },
    });
    const approval = "/api/tables/table-10/group";
    const pending = (
      await (
        await a.post(approval, { data: { action: "join", name: "Aguardando" } })
      ).json()
    ).view;
    expect(pending.me.approved).toBe(false);
    expect(pending.topic).toBeUndefined();
    expect(pending.items).toEqual([]);
    expect(
      (
        await a.post(approval, {
          data: { action: "add", mutationId: crypto.randomUUID(), item: line },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await a.post(approval, {
          data: {
            action: "approve",
            participantId: pending.me.id,
            approved: true,
            mutationId: crypto.randomUUID(),
          },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await staff.post("/api/experience/groups", {
          data: {
            sessionId: pending.id,
            participantId: pending.me.id,
            approved: true,
          },
        })
      ).status(),
    ).toBe(200);
    expect((await (await a.get(approval)).json()).view.me.approved).toBe(true);
    expect(
      (
        await a.post(approval, {
          data: { action: "add", mutationId: crypto.randomUUID(), item: line },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await staff.post("/api/experience/groups", {
          data: { action: "close", sessionId: pending.id },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await a.post(approval, {
          data: { action: "add", mutationId: crypto.randomUUID(), item: line },
        })
      ).status(),
    ).toBe(410);
  } finally {
    await staff.post("/api/experience/settings", {
      data: { config: original },
    });
    await a.dispose();
    await b.dispose();
    await staff.dispose();
  }
});
test("coletivo concorrente, propriedade, revisão, checkout existente e avaliação única", async ({
  baseURL,
}) => {
  const host = await request.newContext({ baseURL }),
    guest = await request.newContext({ baseURL }),
    staff = await request.newContext({ baseURL });
  try {
    await staff.post("/api/auth", { data: creds });
    const config = (await (await staff.get("/api/experience/settings")).json())
      .config;
    expect(
      (
        await staff.post("/api/experience/settings", {
          data: {
            config: {
              ...config,
              reviewDelayMinutes: 0,
              googleReviewUrl: "https://www.google.com/maps",
            },
          },
        })
      ).status(),
    ).toBe(200);
    const path = "/api/tables/table-7/group";
    const join = async (ctx: APIRequestContext, name: string) => {
      const r = await ctx.post(path, {
        data: { action: "join", name, analyticsSessionId: crypto.randomUUID() },
      });
      expect(r.status(), await r.text()).toBe(200);
      return (await r.json()).view;
    };
    const a = await join(host, "Ana"),
      b = await join(guest, "Beto");
    expect(a.ownerId).toBe(a.me.id);
    expect(b.participants).toHaveLength(2);
    expect(JSON.stringify(b)).not.toContain("secretHash");
    const mutate = (ctx: APIRequestContext, data: any) =>
      ctx.post(path, { data: { mutationId: crypto.randomUUID(), ...data } });
    const key = crypto.randomUUID();
    const calls = await Promise.all([
      host.post(path, {
        data: {
          action: "add",
          mutationId: key,
          item: {
            productId: "brasa-classic",
            quantity: 1,
            modifierIds: ["brioche", "medium"],
            notes: "[COLETIVO TESTE]",
            price: 1,
          },
        },
      }),
      mutate(guest, {
        action: "add",
        item: { productId: "cola", quantity: 1, modifierIds: [], notes: "" },
      }),
    ]);
    for (const r of calls) expect(r.status(), await r.text()).toBe(200);
    await host.post(path, {
      data: {
        action: "add",
        mutationId: key,
        item: {
          productId: "brasa-classic",
          quantity: 1,
          modifierIds: ["brioche", "medium"],
          notes: "[COLETIVO TESTE]",
          price: 1,
        },
      },
    });
    let view = (await (await host.get(path)).json()).view;
    expect(view.items).toHaveLength(2);
    expect(view.total).toBe(4080);
    const line = view.items.find((i: any) => i.participantId === a.me.id);
    expect(
      (
        await mutate(guest, {
          action: "remove",
          itemId: line.id,
          version: line.version,
        })
      ).status(),
    ).toBe(403);
    expect((await mutate(guest, { action: "review" })).status()).toBe(403);
    expect((await mutate(host, { action: "review" })).status()).toBe(200);
    expect(
      (
        await mutate(guest, {
          action: "add",
          item: { productId: "cola", quantity: 1, modifierIds: [], notes: "" },
        })
      ).status(),
    ).toBe(409);
    const sent = await host.post(path, {
      data: { action: "checkout", payment: "cashier" },
    });
    expect(sent.status(), await sent.text()).toBe(200);
    const order = (await sent.json()).order;
    const again = (
      await (
        await host.post(path, {
          data: { action: "checkout", payment: "cashier" },
        })
      ).json()
    ).order;
    expect(again.id).toBe(order.id);
    expect(order.items.map((i: any) => i.participantName).sort()).toEqual([
      "Ana",
      "Beto",
    ]);
    const kitchen = (await (await staff.get("/api/orders")).json()).find(
      (o: any) => o.id === order.id,
    );
    expect(kitchen.total).toBe(4080);
    let version = 1;
    for (const status of ["preparing", "ready", "delivered"]) {
      const r = await staff.patch("/api/kitchen/" + order.id, {
        data: { status, version },
      });
      expect(r.status(), await r.text()).toBe(200);
      version++;
    }
    view = (await (await guest.get(path)).json()).view;
    expect(view.status).toBe("finished");
    expect(view.total).toBe(4080);
    expect(view.equal.reduce((s: number, i: any) => s + i.total, 0)).toBe(4080);
    const reviewPath = "/api/reviews/" + order.trackingToken;
    const available = await (await guest.get(reviewPath)).json();
    expect(available.eligible).toBe(true);
    expect(available.googleReviewUrl).toBe("https://www.google.com/maps");
    expect(
      (
        await guest.post(reviewPath, {
          data: {
            food: 1,
            service: 2,
            wait: 1,
            hasProblem: true,
            issues: ["preparation_delay"],
            comment: "[TESTE] Demorou",
            suggestion: "Melhorar organização",
          },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await guest.post(reviewPath, { data: { food: 5, service: 5, wait: 5 } })
      ).status(),
    ).toBe(200);
    expect((await (await guest.get(reviewPath)).json()).reviewed).toBe(true);
    const reviewReport = await (
      await staff.get("/api/experience/reviews?period=30")
    ).json();
    const receivedReview = reviewReport.reviews.find(
      (r: any) => r.orderId === order.id,
    );
    expect(receivedReview.food).toBe(1);
    expect(receivedReview.hasProblem).toBe(true);
    expect(
      reviewReport.alerts.some((a: any) => a.reviewId === receivedReview.id),
    ).toBe(true);
    expect(
      (
        await staff.post("/api/experience/reviews", {
          data: { id: receivedReview.id, status: "handling", version: 1 },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await staff.post("/api/experience/reviews", {
          data: { id: receivedReview.id, status: "resolved", version: 1 },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await staff.post("/api/experience/reviews", {
          data: { id: receivedReview.id, status: "resolved", version: 2 },
        })
      ).status(),
    ).toBe(200);
    expect((await (await guest.get(reviewPath)).json()).googleReviewUrl).toBe(
      "https://www.google.com/maps",
    );
    expect((await mutate(host, { action: "close" })).status()).toBe(200);
    expect(
      (await mutate(guest, { action: "rename", name: "Intruso" })).status(),
    ).toBe(410);
  } finally {
    await host.dispose();
    await guest.dispose();
    await staff.dispose();
  }
});
