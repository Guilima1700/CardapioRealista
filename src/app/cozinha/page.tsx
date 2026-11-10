import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/server/auth";
import { getCatalog, listOrders } from "@/lib/server/db";
import Kitchen from "@/components/kitchen";
export const dynamic = "force-dynamic";
export default async function Page() {
  let session;
  try {
    session = await requireStaff();
  } catch {
    redirect("/equipe");
  }
  const [catalog, orders] = await Promise.all([getCatalog(), listOrders()]);
  return (
    <Kitchen
      initial={orders}
      name={catalog.settings.name}
      role={session.role}
      backend={catalog.backend}
      timezone={catalog.settings.timezone}
      initialNow={Date.now()}
    />
  );
}
