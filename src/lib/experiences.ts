import { z } from "zod";
import { cartLineSchema, AppError, priceCart } from "./validation";
import type { CartLine, Catalog, Order, PricedLine } from "./types";
export const experienceSettingsSchema = z.object({
  collectiveEnabled: z.boolean().default(true),
  sessionMinutes: z.number().int().min(15).max(720).default(180),
  dataMode: z.enum(["production", "demo"]).default("production"),
  entryMode: z.enum(["open", "pin", "approval"]).default("open"),
  allowNewRounds: z.boolean().default(true),
  reviewEnabled: z.boolean().default(true),
  reviewDelayMinutes: z.number().int().min(0).max(1440).default(5),
  googleReviewUrl: z
    .string()
    .max(2000)
    .default("")
    .refine((v) => {
      if (!v) return true;
      try {
        const url = new URL(v);
        return (
          url.protocol === "https:" &&
          !!url.hostname &&
          !url.username &&
          !url.password
        );
      } catch {
        return false;
      }
    }, "Use um endereço HTTPS válido."),
  lowRating: z.number().int().min(1).max(3).default(2),
  minRecommendationViews: z.number().int().min(30).max(10000).default(50),
  minRecommendationOrders: z.number().int().min(10).max(10000).default(20),
  minAnalysisDays: z.number().int().min(7).max(90).default(7),
});
export type ExperienceSettings = z.infer<typeof experienceSettingsSchema>;
export const defaultExperienceSettings = experienceSettingsSchema.parse({});
export const groupLabels = {
  waiting: "Aguardando participantes",
  editing: "Pedido em edição",
  review: "Aguardando confirmação",
  sent: "Pedido enviado",
  preparing: "Pedido em preparação",
  finished: "Pedido finalizado",
  closed: "Sessão encerrada",
  expired: "Sessão expirada",
};
export type GroupStatus = keyof typeof groupLabels;
export type Participant = {
  id: string;
  name: string;
  secretHash: string;
  approved: boolean;
  joinedAt: string;
  analyticsSessionId?: string;
};
export type GroupItem = CartLine & {
  id: string;
  participantId: string;
  version: number;
};
export type GroupState = {
  id: string;
  tableId: string;
  status: GroupStatus;
  version: number;
  ownerId: string;
  joinClosed: boolean;
  expiresAt: string;
  createdAt: string;
  roundKey: string;
  topic: string;
  participants: Participant[];
  items: GroupItem[];
  orders: Order[];
  reviewTotal?: number;
};
export type GroupView = {
  id: string;
  status: GroupStatus;
  version: number;
  me: { id: string; name: string; approved: boolean; denied?: boolean };
  ownerId: string;
  joinClosed: boolean;
  expiresAt: string;
  topic?: string;
  participants: Omit<Participant, "secretHash" | "analyticsSessionId">[];
  items: (PricedLine & {
    id: string;
    version: number;
    participantId: string;
    participantName: string;
  })[];
  orders: Order[];
  total: number;
  individual: { participantId: string; total: number }[];
  equal: { participantId: string; total: number }[];
  config: ExperienceSettings;
  quoteError?: string;
};
export const groupActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("rename"),
    name: z.string().trim().min(1).max(40),
  }),
  z.object({ action: z.literal("add"), item: cartLineSchema }),
  z.object({
    action: z.literal("update"),
    itemId: z.uuid(),
    version: z.number().int().positive(),
    item: cartLineSchema,
  }),
  z.object({
    action: z.literal("remove"),
    itemId: z.uuid(),
    version: z.number().int().positive(),
  }),
  z.object({
    action: z.literal("approve"),
    participantId: z.uuid(),
    approved: z.boolean(),
  }),
  z.object({ action: z.literal("entry"), closed: z.boolean() }),
  z.object({ action: z.literal("review") }),
  z.object({ action: z.literal("edit") }),
  z.object({ action: z.literal("close") }),
  z.object({ action: z.literal("round") }),
]);
export type GroupAction = z.infer<typeof groupActionSchema>;
export function requireParticipant(
  state: GroupState,
  hash: string,
  now = Date.now(),
) {
  if (
    ["closed", "expired"].includes(state.status) ||
    Date.parse(state.expiresAt) <= now
  )
    throw new AppError("Esta sessão foi encerrada ou expirou.", 410);
  const member = state.participants.find((p) => p.secretHash === hash);
  if (!member)
    throw new AppError("Entre neste pedido coletivo para continuar.", 401);
  return member;
}
export function pricedGroup(state: GroupState, catalog: Catalog) {
  return priceCart(state.items, catalog).map((item, i) => ({
    ...item,
    id: state.items[i].id,
    version: state.items[i].version,
    participantId: state.items[i].participantId,
    participantName:
      state.participants.find((p) => p.id === state.items[i].participantId)
        ?.name || "Participante",
  }));
}
export function transitionGroup(
  state: GroupState,
  action: GroupAction,
  member: Participant,
  catalog: Catalog,
  config: ExperienceSettings,
  ids: { itemId: string; roundKey: string },
) {
  if (!member.approved)
    throw new AppError("Aguarde a aprovação da equipe.", 403);
  const owner = member.id === state.ownerId;
  const ownerOnly = () => {
    if (!owner)
      throw new AppError("Somente o responsável pode realizar esta ação.", 403);
  };
  if (action.action === "rename") {
    member.name = action.name;
    return state;
  }
  if (action.action === "entry") {
    ownerOnly();
    state.joinClosed = action.closed;
    return state;
  }
  if (action.action === "close") {
    ownerOnly();
    state.status = "closed";
    state.joinClosed = true;
    return state;
  }
  if (action.action === "round") {
    ownerOnly();
    if (
      !config.allowNewRounds ||
      !["sent", "preparing", "finished"].includes(state.status)
    )
      throw new AppError("Uma nova rodada não está disponível.", 409);
    state.items = [];
    state.roundKey = ids.roundKey;
    state.reviewTotal = undefined;
    state.status = "editing";
    return state;
  }
  if (action.action === "edit") {
    ownerOnly();
    if (state.status !== "review")
      throw new AppError("O pedido não está em revisão.", 409);
    state.status = "editing";
    state.reviewTotal = undefined;
    return state;
  }
  if (action.action === "review") {
    ownerOnly();
    if (!["waiting", "editing"].includes(state.status) || !state.items.length)
      throw new AppError("Adicione produtos antes de revisar.", 409);
    state.reviewTotal = pricedGroup(state, catalog).reduce(
      (s, i) => s + i.total,
      0,
    );
    state.status = "review";
    state.joinClosed = true;
    return state;
  }
  if (action.action === "approve")
    throw new AppError("A aprovação depende de um funcionário.", 403);
  if (!["waiting", "editing"].includes(state.status))
    throw new AppError("O pedido está em revisão ou já foi enviado.", 409);
  if (action.action === "add") {
    if (state.items.length >= 30)
      throw new AppError("Limite de 30 itens por rodada.", 409);
    priceCart([action.item], catalog);
    state.items.push({
      ...action.item,
      id: ids.itemId,
      participantId: member.id,
      version: 1,
    });
  } else {
    const item = state.items.find((i) => i.id === action.itemId);
    if (!item) throw new AppError("Este item já foi removido.", 409);
    if (
      item.participantId !== member.id &&
      !(owner && action.action === "remove")
    )
      throw new AppError("Você só pode alterar os próprios itens.", 403);
    if (item.version !== action.version)
      throw new AppError("O item mudou. Confira a versão atual.", 409);
    if (action.action === "remove")
      state.items = state.items.filter((i) => i.id !== item.id);
    else {
      priceCart([action.item], catalog);
      Object.assign(item, action.item, { version: item.version + 1 });
    }
  }
  state.status = "editing";
  return state;
}
export function splitCents(total: number, ids: string[]) {
  if (!Number.isSafeInteger(total) || total < 0 || !ids.length) return [];
  const base = Math.floor(total / ids.length),
    remainder = total % ids.length;
  return ids.map((id, i) => ({
    participantId: id,
    total: base + (i < remainder ? 1 : 0),
  }));
}
export const reviewIssues = [
  "cold_food",
  "wrong_order",
  "preparation_delay",
  "poor_service",
  "different_product",
  "delivery_problem",
  "other",
] as const;
export const issueLabels: Record<(typeof reviewIssues)[number], string> = {
  cold_food: "Comida fria",
  wrong_order: "Pedido incorreto",
  preparation_delay: "Demora na preparação",
  poor_service: "Atendimento insatisfatório",
  different_product: "Produto diferente do esperado",
  delivery_problem: "Problema com a entrega",
  other: "Outros",
};
export const reviewSchema = z
  .object({
    food: z.number().int().min(1).max(5),
    service: z.number().int().min(1).max(5),
    wait: z.number().int().min(1).max(5),
    comment: z.string().trim().max(2000).default(""),
    suggestion: z.string().trim().max(1500).default(""),
    hasProblem: z.boolean().default(false),
    issues: z.array(z.enum(reviewIssues)).max(7).default([]),
  })
  .refine(
    (v) => new Set(v.issues).size === v.issues.length,
    "Problemas repetidos.",
  );
export type ReviewInput = z.infer<typeof reviewSchema>;
export type Review = ReviewInput & {
  id: string;
  orderId: string;
  tableId: string;
  createdAt: string;
  status: "new" | "analysis" | "handling" | "resolved";
  version: number;
};
