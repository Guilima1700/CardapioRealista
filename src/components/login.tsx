"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, LockKeyhole, Flame } from "lucide-react";
import { api } from "@/lib/client";
import { Brand, Spinner } from "./ui";
import { useHydrated } from "@/lib/use-hydrated";
import type { Settings } from "@/lib/types";
export default function Login({ settings }: { settings: Settings }) {
  const hydrated = useHydrated();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      const result = await api<{ role: string }>("/api/auth", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      window.location.assign(result.role === "admin" ? "/admin" : "/cozinha");
    } catch (e) {
      setError((e as Error).message);
      setPending(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-art">
        <Flame size={50} strokeWidth={1} />
        <h1>
          O bom sabor
          <br />
          começa com
          <br />
          <em>uma boa equipe.</em>
        </h1>
        <p>Cada pedido importa. Cada detalhe também.</p>
        <span>
          {settings.name} · {settings.brandSubtitle || "CARDÁPIO DIGITAL"}
        </span>
      </section>
      <section className="login-form-wrap">
        <Brand
          name={settings.name}
          logo={settings.logo}
          subtitle={settings.brandSubtitle}
        />
        <form className="login-form" onSubmit={submit}>
          <span className="eyebrow">
            <LockKeyhole size={14} /> ÁREA DA EQUIPE
          </span>
          <h2>Bom ter você aqui.</h2>
          <p>Acesse a gestão e o painel da cozinha.</p>
          <label>
            E-mail
            <input
              type="email"
              disabled={!hydrated || pending}
              name="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              disabled={!hydrated || pending}
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Sua senha"
            />
          </label>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <button
            disabled={pending || !hydrated}
            className="button primary full"
          >
            {pending ? (
              <Spinner />
            ) : (
              <>
                Entrar <ArrowRight size={18} />
              </>
            )}
          </button>
          <Link className="back-link" href="/">
            <ArrowLeft size={15} /> Voltar ao cardápio
          </Link>
        </form>
      </section>
    </main>
  );
}
