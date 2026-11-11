import { z } from "zod";
import { browserEventTypes } from "./event-types";
import type { CartLine, Catalog, PricedLine, Status } from "./types";
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const cartLineSchema = z.object({
  productId: z.string().min(1).max(100),
  quantity: z.number().int().min(1).max(20),
  modifierIds: z.array(z.string().max(100)).max(30),
  notes: z.string().max(500).default(""),
});
export const checkoutSchema = z.object({
  tableToken: z.string().min(1).max(200),
  idempotencyKey: z.uuid(),
  payment: z.enum(["cashier", "table"]),
  items: z.array(cartLineSchema).min(1).max(30),
  analyticsSessionId: z.uuid().optional(),
});
export const eventSchema = z.object({
  id: z.uuid().optional(),
  type: z.enum(browserEventTypes),
  productId: z.string().max(100).optional(),
  categoryId: z.string().max(100).optional(),
  sessionId: z.uuid(),
  tableId: z.string().max(100).optional(),
  metadata: z
    .object({
      modifierId: z.string().max(100).optional(),
      recommendationId: z.uuid().optional(),
    })
    .optional(),
});
export const productSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .max(100),
    name: z.string().min(2).max(100),
    description: z.string().max(1000),
    ingredients: z.string().max(1000),
    categoryId: z.string().min(1),
    price: z.number().int().min(0).max(1000000),
    image: z
      .string()
      .max(2000)
      .refine(
        (v) =>
          v.startsWith("https://") ||
          v.startsWith("/uploads/") ||
          v.startsWith("/images/"),
        "Use HTTPS, imagem local ou upload",
      ),
    available: z.boolean(),
    featured: z.boolean(),
    badge: z.string().max(60).optional(),
    allergens: z.array(z.string().max(60)).max(20),
    prepMinutes: z.number().int().min(1).max(240),
    vegetarian: z.boolean().optional(),
    costs: z
      .object({
        production: z.number().int().min(0).max(1000000).optional(),
        ingredients: z.number().int().min(0).max(1000000).optional(),
        additional: z.number().int().min(0).max(1000000).optional(),
      })
      .optional(),
    modelUrl: z
      .string()
      .max(2000)
      .optional()
      .refine(
        (v) => !v || /^(https:\/\/|\/uploads\/|\/models\/)/.test(v),
        "URL de modelo inválida",
      ),
    usdzUrl: z
      .string()
      .max(2000)
      .optional()
      .refine(
        (v) => !v || /^(https:\/\/|\/uploads\/|\/models\/)/.test(v),
        "URL USDZ inválida",
      ),
    modelCredit: z.string().max(500).optional(),
    model3dEnabled: z.boolean().optional(),
    arEnabled: z.boolean().optional(),
    modelAssetId: z.uuid().optional(),
    usdzAssetId: z.uuid().optional(),
    imageAssetId: z.uuid().optional(),
    modelPresentation: z
      .object({
        cameraTheta: z.number().min(-180).max(180),
        cameraPhi: z.number().min(15).max(90),
        cameraRadius: z.number().min(70).max(180),
        exposure: z.number().min(0.4).max(2),
        autoRotate: z.boolean(),
        arScale: z.enum(["fixed", "auto"]),
      })
      .optional(),
    groups: z
      .array(
        z
          .object({
            id: z.string().min(1).max(100),
            name: z.string().min(1).max(100),
            min: z.number().int().min(0).max(30),
            max: z.number().int().min(1).max(30),
            options: z
              .array(
                z.object({
                  id: z.string().min(1).max(100),
                  name: z.string().min(1).max(100),
                  price: z.number().int().min(0).max(100000),
                  featured: z.boolean().optional(),
                }),
              )
              .max(30),
          })
          .refine(
            (g) => g.min <= g.max && g.max <= g.options.length,
            "Limites inválidos",
          ),
      )
      .max(12),
  })
  .refine(
    (p) => p.model3dEnabled !== true || !!p.modelUrl,
    "Associe um modelo antes de habilitar 3D.",
  )
  .refine(
    (p) => p.arEnabled !== true || (!!p.modelUrl && p.model3dEnabled !== false),
    "AR precisa de um modelo com 3D habilitado.",
  )
  .refine((p) => {
    const ids = p.groups.flatMap((g) => g.options.map((o) => o.id));
    return (
      new Set(ids).size === ids.length &&
      new Set(p.groups.map((g) => g.id)).size === p.groups.length
    );
  }, "IDs de opções e grupos devem ser únicos");
export const settingsSchema = z.object({
  brandSubtitle: z.string().max(60).optional(),
  name: z.string().min(2).max(60),
  tagline: z.string().max(150),
  description: z.string().max(300),
  logo: z
    .string()
    .max(2000)
    .refine((v) => !v || v.startsWith("https://") || v.startsWith("/uploads/")),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  font: z.enum(["serif", "sans"]),
  heroImage: z.string().url().startsWith("https://"),
  address: z.string().max(200),
  hours: z.string().max(150),
  open: z.boolean(),
  sendImmediately: z.boolean(),
  payments: z
    .array(z.enum(["cashier", "table"]))
    .min(1)
    .max(2),
  currency: z.literal("BRL"),
  timezone: z.string().refine((v) => {
    try {
      new Intl.DateTimeFormat("pt-BR", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }, "Fuso inválido"),
});
export function priceCart(lines: CartLine[], catalog: Catalog): PricedLine[] {
  return lines.map((line) => {
    const product = catalog.products.find(
      (p) => p.id === line.productId && p.available,
    );
    if (!product)
      throw new AppError(
        "Um produto está indisponível. Revise seu pedido.",
        409,
      );
    if (
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > 20
    )
      throw new AppError("Quantidade inválida.");
    if (new Set(line.modifierIds).size !== line.modifierIds.length)
      throw new AppError("Adicionais duplicados.");
    const all = product.groups.flatMap((g) => g.options);
    const modifiers = line.modifierIds.map((id) => {
      const m = all.find((o) => o.id === id);
      if (!m) throw new AppError("Adicional inválido.");
      return m;
    });
    for (const group of product.groups) {
      const count = group.options.filter((o) =>
        line.modifierIds.includes(o.id),
      ).length;
      if (count < group.min || count > group.max)
        throw new AppError(`Revise a seleção: ${group.name}.`);
    }
    const unitPrice =
      product.price + modifiers.reduce((sum, m) => sum + m.price, 0);
    return {
      ...line,
      name: product.name,
      unitPrice,
      total: unitPrice * line.quantity,
      modifiers,
      allergens: product.allergens,
    };
  });
}
export function assertTransition(current: Status, next: Status) {
  const sequence: Status[] = [
    "received",
    "confirmed",
    "preparing",
    "ready",
    "delivered",
  ];
  if (sequence.indexOf(next) !== sequence.indexOf(current) + 1)
    throw new AppError(
      "O pedido já mudou. Atualize a tela e tente novamente.",
      409,
    );
}
