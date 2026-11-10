import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/server/auth";
import Admin from "@/components/admin";
export const dynamic = "force-dynamic";
export default async function Page() {
  let role;
  try {
    role = (await requireStaff()).role;
  } catch {
    redirect("/equipe");
  }
  if (role !== "admin") redirect("/cozinha");
  return <Admin />;
}
