"use client";

import { useEffect, useState } from "react";
import { LAG_LABEL, type GringaItem } from "@stalo/shared";
import { fetchGringa } from "@/lib/api";
import { formatShortDate } from "@/lib/ui";

// Cada item é um link pra fonte: a fonte é o produto no Stalo, então o veículo
// fica em destaque (mesmo átomo mono usado no veredito) e o card inteiro abre a
// origem. A defasagem pro BR é o selo colorido — a vantagem de timing à vista.
function GringaCard({ item }: { item: GringaItem }) {
  const months = `~${item.lagMonths} ${item.lagMonths === 1 ? "mês" : "meses"} de atraso`;
  return (
    <a
      className={`gringa-item lag-${item.lag}`}
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      <div className="gringa-item-top">
        <span className="gringa-outlet">{item.source}</span>
        <span className="gringa-region">
          <span aria-hidden="true">{item.flag}</span> {item.region}
        </span>
        <span className="gringa-meta">
          {formatShortDate(item.date)} · {months}
        </span>
      </div>
      <h3 className="gringa-item-title">{item.title}</h3>
      <p className="gringa-item-sum">{item.summary}</p>
      <span className="gringa-lag">
        <span className="gringa-lag-dot" aria-hidden="true" />
        {LAG_LABEL[item.lag]}
      </span>
    </a>
  );
}

export function GringaFeed() {
  const [items, setItems] = useState<GringaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // busca o feed real na montagem (cache+TTL vive no servidor). setState fica
  // SÓ dentro do async (then/catch/finally), com flag `cancelled` no cleanup pra
  // não atualizar após desmontar — o estado inicial (loading=true) já cobre a
  // primeira renderização, então nada de setState síncrono no corpo do effect.
  useEffect(() => {
    let cancelled = false;
    fetchGringa()
      .then((feed) => {
        if (cancelled) return;
        setItems(feed);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Não consegui carregar o feed agora.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="gringa">
      {/* div, não <header>: a regra global header{} do topo do app é display:flex
          com padding/borda/gradiente e vazaria pra cá, empilhando eyebrow/título/
          subtítulo numa linha cramada. */}
      <div className="gringa-head">
        <span className="v-eyebrow">Antes de virar assunto aqui</span>
        <h2 className="gringa-title">Últimas atualizações na gringa</h2>
        <p className="gringa-sub">
          A maioria das tendências de tech começa lá fora e chega tarde no Brasil. Aqui está o que já
          se move — e quanto tempo você tem antes de virar concorrência.
        </p>
      </div>

      {loading ? (
        <div className="brief-empty">Buscando o que já se move lá fora…</div>
      ) : error ? (
        <div className="brief-empty">{error}</div>
      ) : items.length === 0 ? (
        <div className="brief-empty">Nada novo no radar da gringa por enquanto.</div>
      ) : (
        <div className="gringa-list">
          {items.map((item) => (
            <GringaCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
