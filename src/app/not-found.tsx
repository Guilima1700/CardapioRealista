import Link from "next/link";
import { Brand } from "@/components/ui";
export default function NotFound() {
  return (
    <main className="tracking-shell">
      <Brand />
      <div className="empty">
        <h1>Não encontramos este caminho.</h1>
        <p>Confira o link ou escaneie novamente o QR Code da sua mesa.</p>
        <Link className="button primary" href="/">
          Voltar ao cardápio
        </Link>
      </div>
    </main>
  );
}
