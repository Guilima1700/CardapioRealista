import { endpoint } from "@/lib/server/http";
import { publicRecommendations } from "@/lib/server/commerce";
export const GET = endpoint(async () => publicRecommendations());
