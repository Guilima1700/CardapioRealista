import "server-only";
import type { Order } from "../types";
/** Extension contract. No printer/POS network integration is enabled in the MVP. */
export type IntegrationEvent = {
  id: string;
  orderId: string;
  version: number;
  type: "order.created" | "order.status_changed";
  snapshot: Omit<Order, "trackingToken" | "idempotencyKey">;
};
export interface OrderIntegration {
  name: string;
  /** Adapter must deduplicate on event.id and acknowledge only after success. */
  deliver(event: IntegrationEvent): Promise<void>;
}
