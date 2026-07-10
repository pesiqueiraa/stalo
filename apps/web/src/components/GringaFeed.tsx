"use client";

import { GRINGA_ITEMS, LAG_LABEL, type GringaItem } from "@/lib/gringaMock";
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

      <div className="gringa-note" role="note">
        <strong>Exemplo ilustrativo.</strong> No produto real, este feed vem de uma busca contínua a
        fontes internacionais — aqui os itens são montados no navegador pra você ver o formato.
      </div>

      <div className="gringa-list">
        {GRINGA_ITEMS.map((item) => (
          <GringaCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
