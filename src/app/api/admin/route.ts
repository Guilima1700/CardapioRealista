import { z } from "zod";
import { randomUUID } from "node:crypto";
import { endpoint, body } from "@/lib/server/http";
import {
  getCatalog,
  saveEntity,
  listOrders,
  listStaff,
  addStaff,
  setStaffActive,
  listEvents,
} from "@/lib/server/db";
import { requireStaff } from "@/lib/server/auth";
import { AppError, productSchema, settingsSchema } from "@/lib/validation";
import { publishProductMedia } from "@/lib/server/assets";
export const GET = endpoint(async (request) => {
  await requireStaff(true);
  const days = Math.min(
    365,
    Math.max(1, Number(request.nextUrl.searchParams.get("days")) || 30),
  );
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const [catalog, orders, staff, events] = await Promise.all([
    getCatalog(),
    listOrders(),
    listStaff(),
    listEvents(since),
  ]);
  return {
    catalog,
    orders: orders.filter((o) => o.createdAt >= since),
    staff,
    events,
    since,
    days,
  };
});
export const POST = endpoint(async (request) => {
  const session = await requireStaff(true);
  const input = z
    .object({ action: z.string(), data: z.unknown() })
    .parse(await body(request));
  if (input.action === "product") {
    const product = productSchema.parse(input.data);
    const catalog = await getCatalog();
    if (!catalog.categories.some((c) => c.id === product.categoryId))
      throw new AppError("Categoria inexistente.");
    await publishProductMedia(product, session.id);
    await saveEntity("product", product);
  } else if (input.action === "settings")
    await saveEntity("settings", settingsSchema.parse(input.data));
  else if (input.action === "category") {
    const value = z
      .object({
        id: z
          .string()
          .regex(/^[a-z0-9-]+$/)
          .max(100),
        name: z.string().min(2).max(100),
        icon: z.string().max(30),
        position: z.number().int().min(0).max(100),
      })
      .parse(input.data);
    await saveEntity("category", value);
  } else if (input.action === "table") {
    const value = z
      .object({
        id: z.string().min(1).max(100),
        name: z.string().min(1).max(60),
        active: z.boolean(),
      })
      .parse(input.data);
    const catalog = await getCatalog();
    const old = catalog.tables.find((t) => t.id === value.id);
    await saveEntity("table", { ...value, token: old?.token || randomUUID() });
  } else if (input.action === "staff") {
    const value = z
      .object({
        email: z.email().max(200),
        password: z.string().min(10).max(200),
        role: z.enum(["admin", "kitchen"]),
      })
      .parse(input.data);
    await addStaff(value.email.toLowerCase(), value.password, value.role);
  } else if (input.action === "staffActive") {
    const value = z
      .object({ id: z.uuid(), active: z.boolean() })
      .parse(input.data);
    if (value.id === session.id)
      throw new AppError("Você não pode desativar o próprio acesso.");
    await setStaffActive(value.id, value.active);
  } else throw new AppError("Operação inválida.");
  return { ok: true };
});
