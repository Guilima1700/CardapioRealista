import { z } from "zod";
import { endpoint, body } from "@/lib/server/http";
import { requireStaff } from "@/lib/server/auth";
import { reviewsReport, updateReview } from "@/lib/server/commerce";
export const GET = endpoint(async (request) => {
  await requireStaff();
  return reviewsReport(request.nextUrl.searchParams);
});
export const POST = endpoint(async (request) => {
  await requireStaff();
  const r = z
    .object({
      id: z.uuid(),
      status: z.enum(["new", "analysis", "handling", "resolved"]),
      version: z.number().int().positive(),
    })
    .parse(await body(request));
  return updateReview(r.id, r.status, r.version);
});
