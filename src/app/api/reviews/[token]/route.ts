import { endpoint, body, rateLimit } from "@/lib/server/http";
import { reviewAvailability, submitReview } from "@/lib/server/experiences";
import { z } from "zod";
export const GET = endpoint(async (_request, ctx) => {
  const a = await reviewAvailability(z.uuid().parse((await ctx.params).token));
  return {
    eligible: a.eligible,
    eligibleAt: a.eligibleAt,
    reviewed: a.existing,
    googleReviewUrl: a.config.googleReviewUrl,
    enabled: a.config.reviewEnabled,
  };
});
export const POST = endpoint(async (request, ctx) => {
  rateLimit(request, "reviews", 30);
  return submitReview(
    z.uuid().parse((await ctx.params).token),
    await body(request),
  );
});
