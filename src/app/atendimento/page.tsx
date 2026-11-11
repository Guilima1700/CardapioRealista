import { redirect } from "next/navigation";
import Link from "next/link";
import { requireStaff } from "@/lib/server/auth";
import { ReviewsPanel, CollectivePanel } from "@/components/experience-admin";
export const dynamic = "force-dynamic";
export default async function Page() {
  try {
    await requireStaff();
  } catch {
    redirect("/equipe");
  }
  return (
    <main className="brasa-service-shell">
      <Link className="back-link" href="/cozinha">
        ← Voltar à cozinha
      </Link>
      <h1>Atendimento e avaliações</h1>
      <CollectivePanel />
      <ReviewsPanel />
    </main>
  );
}
