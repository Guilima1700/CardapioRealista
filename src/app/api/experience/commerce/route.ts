import { z } from "zod";
import { endpoint, body } from "@/lib/server/http";
import { requireStaff } from "@/lib/server/auth";
import { commercialReport, actOnRecommendation } from "@/lib/server/commerce";
export const GET = endpoint(async (request) => {
  await requireStaff(true);
  return commercialReport(request.nextUrl.searchParams);
});
export const POST = endpoint(async (request) => {
  const staff = await requireStaff(true);
  const input = z
    .object({
      id: z.uuid(),
      version: z.number().int().positive(),
      mutationId: z.uuid(),
      action: z.enum(["apply", "ignore", "resolve", "disable"]),
      confirmed: z.boolean().optional(),
      text: z.string().max(1000).optional(),
    })
    .parse(await body(request));
  return actOnRecommendation(input, staff.id);
});
