"use client";
import { useEffect, useState, useRef } from "react";
import { api, track } from "@/lib/client";
import { money, type Product } from "@/lib/types";
type Suggestion = {
  id: string;
  productId?: string;
  relatedId?: string;
  text: string;
  hour?: number;
};
export default function CustomerRecommendations({
  products,
  onSelect,
  timezone,
}: {
  products: Product[];
  onSelect: (p: Product) => void;
  timezone: string;
}) {
  const [rows, setRows] = useState<Suggestion[]>([]),
    container = useRef<HTMLElement>(null);
  useEffect(() => {
    let mounted = true;
    void api<Suggestion[]>("/api/recommendations")
      .then((r) => {
        if (mounted) setRows(r);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hourCycle: "h23",
    }).format(new Date()),
  );
  const visible = rows.filter((r) => r.hour === undefined || r.hour === hour);
  useEffect(() => {
    if (!container.current || !visible.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting))
          for (const r of visible)
            track("recommendation_view", r.relatedId, undefined, {
              recommendationId: r.id,
            });
      },
      { threshold: 0.3 },
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [rows, hour]);
  if (!visible.length) return null;
  return (
    <section className="brasa-customer-recommendations" ref={container}>
      <span className="eyebrow">BOAS ESCOLHAS, EM BOA COMPANHIA</span>
      <h2>Combina com o seu momento.</h2>
      <div>
        {visible.map((r) => {
          const a = products.find((p) => p.id === r.productId && p.available),
            b = products.find((p) => p.id === r.relatedId && p.available);
          return (
            <article key={r.id}>
              <p>{r.text}</p>
              {a && b && (
                <>
                  <small>Quem pede {a.name} também costuma escolher</small>
                  <button
                    onClick={() => {
                      track("recommendation_click", b.id, b.categoryId, {
                        recommendationId: r.id,
                      });
                      onSelect(b);
                    }}
                  >
                    <img src={b.image} alt="" />
                    <span>
                      <b>{b.name}</b>
                      <small>{money(b.price)}</small>
                    </span>
                    <span>+</span>
                  </button>
                </>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
