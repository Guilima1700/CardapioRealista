import { z } from "zod";
import { endpoint, body } from "@/lib/server/http";
import { requireStaff } from "@/lib/server/auth";
import {
  experienceConfig,
  saveExperienceConfig,
} from "@/lib/server/experiences";
export const GET = endpoint(async () => {
  await requireStaff(true);
  const { config, pinHash } = await experienceConfig();
  return { config, pinConfigured: !!pinHash };
});
export const POST = endpoint(async (request) => {
  await requireStaff(true);
  const p = z
    .object({ config: z.unknown(), pin: z.string().min(4).max(100).optional() })
    .parse(await body(request));
  return saveExperienceConfig(p.config, p.pin);
});
