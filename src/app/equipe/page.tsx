import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/server/auth";
import Login from "@/components/login";
import { getCatalog } from "@/lib/server/db";
export const dynamic = "force-dynamic";
export default async function Page() {
  let role;
  try {
    role = (await requireStaff()).role;
  } catch {}
  if (role) redirect(role === "admin" ? "/admin" : "/cozinha");
  const { settings } = await getCatalog();
  return <Login settings={settings} />;
}
