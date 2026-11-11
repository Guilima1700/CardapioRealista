export type Role = "admin" | "kitchen";
export type Status =
  "received" | "confirmed" | "preparing" | "ready" | "delivered";
export const statuses: Status[] = [
  "received",
  "confirmed",
  "preparing",
  "ready",
  "delivered",
];
export const statusLabels: Record<Status, string> = {
  received: "Recebido",
  confirmed: "Confirmado",
  preparing: "Em preparo",
  ready: "Pronto",
  delivered: "Entregue",
};
export type Modifier = {
  id: string;
  name: string;
  price: number;
  featured?: boolean;
};
export type ModifierGroup = {
  id: string;
  name: string;
  min: number;
  max: number;
  options: Modifier[];
};
export type Product = {
  id: string;
  name: string;
  description: string;
  ingredients: string;
  categoryId: string;
  price: number;
  image: string;
  available: boolean;
  featured: boolean;
  badge?: string;
  allergens: string[];
  prepMinutes: number;
  groups: ModifierGroup[];
  modelUrl?: string;
  usdzUrl?: string;
  modelCredit?: string;
  model3dEnabled?: boolean;
  arEnabled?: boolean;
  modelAssetId?: string;
  usdzAssetId?: string;
  imageAssetId?: string;
  modelPresentation?: ModelPresentation;
  vegetarian?: boolean;
  costs?: { production?: number; ingredients?: number; additional?: number };
};
export type ModelPresentation = {
  cameraTheta: number;
  cameraPhi: number;
  cameraRadius: number;
  exposure: number;
  autoRotate: boolean;
  arScale: "fixed" | "auto";
};
export type ProductAsset = {
  id: string;
  productId: string;
  kind: "image" | "model" | "usdz";
  url: string;
  originalName: string;
  bytes: number;
  mime: string;
  sha256: string;
  dimensions?: { widthCm: number; heightCm: number; depthCm: number };
  archivedAt?: string | null;
  createdAt: string;
};
export type Category = {
  id: string;
  name: string;
  icon: string;
  position: number;
};
export type Table = {
  id: string;
  name: string;
  token: string;
  active: boolean;
};
export type Settings = {
  brandSubtitle?: string;
  name: string;
  tagline: string;
  description: string;
  logo: string;
  color: string;
  font: "serif" | "sans";
  heroImage: string;
  address: string;
  hours: string;
  open: boolean;
  sendImmediately: boolean;
  payments: ("cashier" | "table")[];
  currency: "BRL";
  timezone: string;
};
export type Catalog = {
  settings: Settings;
  categories: Category[];
  products: Product[];
  tables: Table[];
  backend: "sqlite" | "supabase";
};
export type CartLine = {
  productId: string;
  quantity: number;
  modifierIds: string[];
  notes: string;
  participantId?: string;
  participantName?: string;
  analyticsSessionId?: string;
};
export type PricedLine = CartLine & {
  name: string;
  unitPrice: number;
  total: number;
  modifiers: Modifier[];
  allergens: string[];
};
export type Order = {
  id: string;
  number: number;
  tableId: string;
  tableName: string;
  trackingToken: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  status: Status;
  version: number;
  total: number;
  payment: "cashier" | "table";
  items: PricedLine[];
  history: { status: Status; at: string }[];
  analyticsSessionId?: string;
  groupSessionId?: string;
  dataMode?: "production" | "demo";
};
export type Staff = { id: string; email: string; role: Role; active: boolean };
export type AnalyticsEvent = {
  id?: string;
  type: (typeof import("./event-types").allEventTypes)[number];
  productId?: string;
  categoryId?: string;
  sessionId: string;
  tableId?: string;
  metadata?: { modifierId?: string; recommendationId?: string };
};
export const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
