import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { z } from "zod";
import { endpoint, body, rateLimit } from "@/lib/server/http";
import { getCatalog, recordEvent } from "@/lib/server/db";
import { AppError } from "@/lib/validation";
import { groupActionSchema } from "@/lib/experiences";
import {
  activeGroup,
  experienceConfig,
  groupView,
  joinGroup,
  joinThrottle,
  mutateGroup,
  checkoutGroup,
} from "@/lib/server/experiences";
async function context(id: string) {
  const catalog = await getCatalog();
  const table = catalog.tables.find(
    (t) => t.active && (t.id === id || t.id === "table-" + id),
  );
  if (!table) throw new AppError("Mesa não encontrada.", 404);
  const jar = await cookies(),
    key =
      "brasa_group_" +
      createHash("sha256").update(table.id).digest("hex").slice(0, 16);
  return { table, jar, key, secret: jar.get(key)?.value };
}
export const GET = endpoint(async (_request, ctx) => {
  const { table, secret } = await context((await ctx.params).id),
    state = await activeGroup(table.id),
    { config } = await experienceConfig();
  if (state && secret) {
    try {
      return {
        view: await groupView(state, secret),
        table: { id: table.id, name: table.name },
        config,
      };
    } catch (e) {
      if (!(e instanceof AppError) || ![401, 410].includes(e.status)) throw e;
    }
  }
  return {
    view: null,
    active: !!state,
    participants: state?.participants.length || 0,
    status: state?.status,
    table: { id: table.id, name: table.name },
    config,
  };
});
export const POST = endpoint(async (request, ctx) => {
  rateLimit(request, "group", 120);
  const { table, jar, key, secret } = await context((await ctx.params).id),
    input = await body(request);
  if (input?.action === "join") {
    const data = z
      .object({
        name: z.string().trim().min(1).max(40),
        pin: z.string().max(100).optional(),
        analyticsSessionId: z.uuid().optional(),
      })
      .parse(input);
    const { config } = await experienceConfig();
    if (config.entryMode === "pin")
      await joinThrottle(
        request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown",
        table.id,
      );
    const joined = await joinGroup(
      table.id,
      data.name,
      data.pin,
      secret,
      data.analyticsSessionId,
    );
    jar.set(key, joined.secret, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://"),
      path: "/",
      expires: new Date(joined.state.expiresAt),
    });
    const view = await groupView(joined.state, joined.secret);
    await recordEvent(
      {
        id: view.me.id,
        type: "group_join",
        sessionId: data.analyticsSessionId || view.me.id,
        tableId: table.id,
      },
      true,
    ).catch((e) => console.error("Group analytics failed", e));
    return { view };
  }
  if (!secret)
    throw new AppError("Entre no pedido coletivo para continuar.", 401);
  if (input?.action === "checkout")
    return {
      order: await checkoutGroup(
        table.id,
        secret,
        z.enum(["cashier", "table"]).parse(input.payment),
      ),
    };
  const mutationId = z.uuid().parse(input?.mutationId),
    action = groupActionSchema.parse(input);
  const view = await mutateGroup(table.id, secret, action, mutationId);
  if ("closed" in view) jar.delete(key);
  return { view };
});
