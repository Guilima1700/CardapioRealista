import { endpoint, body, rateLimit } from "@/lib/server/http";
import { createOrder, listOrders } from "@/lib/server/db";
import { requireStaff } from "@/lib/server/auth";
import { checkoutSchema } from "@/lib/validation";
export const GET = endpoint(async () => {
  await requireStaff();
  return listOrders();
});
export const POST = endpoint(async (request) => {
  rateLimit(request, "checkout", 20);
  return createOrder(checkoutSchema.parse(await body(request)));
});
