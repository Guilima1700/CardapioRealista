import type { Catalog, Order } from "./types";
import type { CommercialEvent, Period } from "./intelligence";
/** Explicit, isolated illustration. Never persisted or combined with restaurant records. */
export function commerceExample(catalog: Catalog, period: Period) {
  const events: CommercialEvent[] = [],
    orders: Order[] = [];
  const products = catalog.products.filter((p) => p.available).slice(0, 3);
  if (products.length < 2) return { events, orders };
  const days = Math.min(
    14,
    Math.round((Date.parse(period.end) - Date.parse(period.start)) / 86400000),
  );
  for (let d = 0; d < days; d++)
    for (let n = 0; n < 30; n++) {
      const session = `example-${d}-${n}`,
        at = new Date(
          Date.parse(period.start) + d * 86400000 + 12 * 3600000 + n * 60000,
        ).toISOString();
      const event = (type: string, product_id?: string) =>
        events.push({
          id: `${session}-${type}-${product_id || ""}`,
          session_id: session,
          type,
          product_id,
          created_at: at,
          metadata: { dataMode: "demo" },
        });
      event("menu_open");
      for (const p of products) {
        event("product_view", p.id);
        if (p !== products[2]) event("model_view", p.id);
        if (n % 2 === 0) event("ar_start", p.id);
        if ((p !== products[2] && n < 20) || (p === products[2] && n === 0))
          event("add_to_cart", p.id);
      }
      if (n < 20) {
        const selected =
          n < 12 || products.length < 3
            ? products.slice(0, 2)
            : products.slice(2, 3);
        const items = selected.map((p) => ({
          productId: p.id,
          quantity: 1,
          modifierIds: [],
          notes: "EXEMPLO ILUSTRATIVO",
          name: p.name,
          unitPrice: p.price,
          total: p.price,
          modifiers: [],
          allergens: p.allergens,
        }));
        orders.push({
          id: session,
          number: orders.length + 1,
          tableId: catalog.tables[0]?.id || "example",
          tableName: "Mesa exemplo",
          trackingToken: session,
          idempotencyKey: session,
          createdAt: at,
          updatedAt: at,
          status: "delivered",
          version: 4,
          total: items.reduce((s, i) => s + i.total, 0),
          payment: "cashier",
          items,
          history: [{ status: "delivered", at }],
          analyticsSessionId: session,
          dataMode: "demo",
        });
      }
    }
  return { events, orders };
}
