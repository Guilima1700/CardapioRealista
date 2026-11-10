import { endpoint, body, rateLimit } from "@/lib/server/http";
import { recordEvent } from "@/lib/server/db";
import { eventSchema } from "@/lib/validation";
export const POST = endpoint(async (request) => {
  rateLimit(request, "analytics", 120);
  await recordEvent(eventSchema.parse(await body(request)));
  return { ok: true };
});
