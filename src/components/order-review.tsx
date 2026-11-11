"use client";
import { useEffect, useState } from "react";
import { Star, Heart, ArrowUpRight, Check } from "lucide-react";
import { api } from "@/lib/client";
import { readStored, writeStored } from "@/lib/browser-storage";
import { issueLabels, reviewIssues } from "@/lib/experiences";
import { Spinner } from "./ui";
type Availability = {
  eligible: boolean;
  eligibleAt: string | null;
  reviewed: boolean;
  googleReviewUrl: string;
  enabled: boolean;
};
export default function OrderReview({
  token,
  status,
}: {
  token: string;
  status: string;
}) {
  const [availability, setAvailability] = useState<Availability | null>(null),
    [dismissed, setDismissed] = useState(false),
    [scores, setScores] = useState({ food: 0, service: 0, wait: 0 }),
    [comment, setComment] = useState(""),
    [suggestion, setSuggestion] = useState(""),
    [issues, setIssues] = useState<string[]>([]),
    [problem, setProblem] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setDismissed(!!readStored("brasa_review_dismissed_" + token));
    async function load() {
      try {
        const data = await api<Availability>("/api/reviews/" + token);
        if (active) setAvailability(data);
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    }
    void load();
    const id = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [token, status]);
  if (status !== "delivered" || !availability) return null;
  const google = availability.googleReviewUrl ? (
    <a
      className="button secondary"
      href={availability.googleReviewUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      Avaliar no Google <ArrowUpRight size={16} />
    </a>
  ) : null;
  if (availability.reviewed)
    return (
      <section className="brasa-review-card">
        <Heart size={24} />
        <h2>Obrigado por compartilhar.</h2>
        <p>Sua avaliação foi registrada e ajuda a casa a melhorar.</p>
        {google}
      </section>
    );
  if (!availability.eligible || dismissed)
    return google ? (
      <section className="brasa-review-card brasa-review-discreet">
        <p>Quer compartilhar sua experiência publicamente?</p>
        {google}
      </section>
    ) : null;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/reviews/" + token, {
        method: "POST",
        body: JSON.stringify({
          ...scores,
          comment,
          suggestion,
          issues,
          hasProblem: problem || issues.length > 0,
        }),
      });
      setAvailability((a) => (a ? { ...a, reviewed: true } : a));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="brasa-review-card">
      <span className="eyebrow">A SUA EXPERIÊNCIA IMPORTA</span>
      <h2>Como foi o seu momento?</h2>
      <p>É rápido. Conte o que gostou e o que podemos cuidar melhor.</p>
      <form onSubmit={submit}>
        {(
          [
            ["food", "Qualidade da comida"],
            ["service", "Atendimento"],
            ["wait", "Tempo de espera"],
          ] as const
        ).map(([key, title]) => (
          <fieldset className="brasa-review-rating" key={key} disabled={busy}>
            <legend>{title}</legend>
            <div className="brasa-stars">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className={scores[key] >= n ? "selected" : ""}>
                  <input
                    type="radio"
                    required
                    name={key}
                    aria-label={`${title}: ${n} ${n === 1 ? "estrela" : "estrelas"}`}
                    value={n}
                    checked={scores[key] === n}
                    onChange={() => setScores((s) => ({ ...s, [key]: n }))}
                  />
                  <Star
                    size={29}
                    fill={scores[key] >= n ? "currentColor" : "none"}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={problem}
            disabled={busy}
            onChange={(e) => setProblem(e.target.checked)}
          />
          Aconteceu algum problema
        </label>
        <fieldset disabled={busy} className="brasa-review-issues">
          <legend>
            Algo que devemos melhorar? <small>Opcional</small>
          </legend>
          {reviewIssues.map((issue) => (
            <label key={issue}>
              <input
                type="checkbox"
                checked={issues.includes(issue)}
                onChange={() =>
                  setIssues((old) =>
                    old.includes(issue)
                      ? old.filter((i) => i !== issue)
                      : [...old, issue],
                  )
                }
              />
              {issueLabels[issue]}
            </label>
          ))}
        </fieldset>
        <label className="brasa-social-field">
          Seu comentário <small>Opcional</small>
          <textarea
            value={comment}
            disabled={busy}
            onChange={(e) => setComment(e.target.value)}
            maxLength={2000}
            rows={3}
          />
        </label>
        <label className="brasa-social-field">
          Uma sugestão para a casa <small>Opcional</small>
          <textarea
            value={suggestion}
            disabled={busy}
            onChange={(e) => setSuggestion(e.target.value)}
            maxLength={1500}
            rows={2}
          />
        </label>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <button
          className="button primary full"
          disabled={busy || Object.values(scores).some((n) => !n)}
        >
          {busy ? <Spinner /> : <Check size={17} />}Enviar avaliação
        </button>
        <button
          className="button ghost full"
          type="button"
          disabled={busy}
          onClick={() => {
            writeStored("brasa_review_dismissed_" + token, "1");
            setDismissed(true);
          }}
        >
          Agora não
        </button>
      </form>
      <div className="brasa-review-google">{google}</div>
    </section>
  );
}
