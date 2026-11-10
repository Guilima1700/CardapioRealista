import { cookies } from "next/headers";
import { z } from "zod";
import { endpoint, body, rateLimit } from "@/lib/server/http";
import { login, requireStaff, realtimeToken } from "@/lib/server/auth";
export const POST = endpoint(async (request) => {
  rateLimit(request, "login", 8);
  const input = z
    .object({ email: z.email().max(200), password: z.string().min(1).max(200) })
    .parse(await body(request));
  return login(input.email.toLowerCase(), input.password);
});
export const GET = endpoint(async () => {
  const session = await requireStaff();
  return {
    id: session.id,
    email: session.email,
    role: session.role,
    accessToken: await realtimeToken(),
  };
});
export const DELETE = endpoint(async () => {
  (await cookies()).delete("brasa_staff");
  return { ok: true };
});
