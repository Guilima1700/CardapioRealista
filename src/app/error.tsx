"use client";
import { Brand } from "@/components/ui";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="tracking-shell">
      <Brand />
      <div className="empty">
        <h1>Precisamos de mais um instante.</h1>
        <p>
          Não foi possível carregar a página. Verifique sua conexão e tente
          novamente.
        </p>
        <button className="button primary" onClick={reset}>
          Tentar novamente
        </button>
      </div>
    </main>
  );
}
