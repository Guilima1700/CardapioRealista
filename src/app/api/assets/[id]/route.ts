import { z } from "zod";
import { endpoint } from "@/lib/server/http";
import { requireStaff } from "@/lib/server/auth";
import { archiveProductAsset } from "@/lib/server/assets";
export const DELETE = endpoint(async (_request, context) => {
  const session = await requireStaff(true);
  const { id } = await context.params;
  return archiveProductAsset(z.uuid().parse(id), session.id);
});
