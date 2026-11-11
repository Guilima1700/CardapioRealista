import { z } from "zod";
import { endpoint, body } from "@/lib/server/http";
import { requireStaff } from "@/lib/server/auth";
import {
  staffGroups,
  approveParticipant,
  closeStaffGroup,
} from "@/lib/server/experiences";
export const GET = endpoint(async () => {
  await requireStaff();
  return staffGroups();
});
export const POST = endpoint(async (request) => {
  const staff = await requireStaff();
  const input = await body(request);
  if (input?.action === "close") {
    const p = z.object({ sessionId: z.uuid() }).parse(input);
    return closeStaffGroup(p.sessionId, staff.id);
  }
  const p = z
    .object({
      sessionId: z.uuid(),
      participantId: z.uuid(),
      approved: z.boolean(),
    })
    .parse(input);
  return approveParticipant(p.sessionId, p.participantId, p.approved);
});
