import { endpoint } from "@/lib/server/http";
import { findOrder } from "@/lib/server/db";
import { AppError } from "@/lib/validation";
export const GET = endpoint(async (_request, context) => {
  const { token } = await context.params;
  const order = await findOrder(token);
  if (!order) throw new AppError("Pedido não encontrado.", 404);
  return order;
});
