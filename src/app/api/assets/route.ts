import { z } from "zod";
import { endpoint } from "@/lib/server/http";
import { requireStaff } from "@/lib/server/auth";
import { listProductAssets } from "@/lib/server/assets";
export const GET = endpoint(async (request) => {
  const session = await requireStaff(true);
  const id = z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .max(100)
    .parse(request.nextUrl.searchParams.get("productId"));
  return listProductAssets(id, session.id);
});
