import { z } from "zod";
import { endpoint, body } from "@/lib/server/http";
import { updateOrder } from "@/lib/server/db";
import { requireStaff } from "@/lib/server/auth";
export const PATCH = endpoint(async (request, context) => {
  await requireStaff();
  const { id } = await context.params;
  const input = z
    .object({
      status: z.enum(["confirmed", "preparing", "ready", "delivered"]),
      version: z.number().int().positive(),
    })
    .parse(await body(request));
  return updateOrder(id, input.status, input.version);
});
