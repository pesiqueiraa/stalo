"use client";

import type { NewsItem } from "@stalo/shared";
import {
  ENTERPRISE_TAG_INFO,
  IMPACT_LABELS,
  type EnterpriseImpact,
  type EnterpriseInsight,
} from "@/lib/enterpriseMock";
import { labelForType } from "@/lib/ui";
import { topicColor } from "@/lib/graph";

const IMPACT_KEYS = Object.keys(IMPACT_LABELS) as (keyof EnterpriseImpact)[];

// Card completo de um insight: usado no SignalDrawer (Sala e Lista abrem o
// mesmo painel de detalhe ao clicar um sinal). Mesma linguagem visual do
// Brief.tsx pessoal (reaproveita .brief-card/.detail-type/.detail-section de
// globals.css), com as somas próprias do tier empresa — tags, impacto pro
// negócio e quem do time sinalizou primeiro.
export function EnterpriseBriefCard({
  insight,
  sources,
  topics,
}: {
  insight: EnterpriseInsight;
  sources: NewsItem[];
  topics: string[];
}) {
  return (
    <article className="brief-card">
      <div className="brief-card-head">
        <span className={`detail-type detail-${insight.type}`}>{labelForType(insight.type)}</span>
      </div>

      {insight.tags.length > 0 && (
        <div className="ent-tag-row">
          {insight.tags.map((tag) => {
            const info = ENTERPRISE_TAG_INFO[tag];
            return (
              <span key={tag} className="ent-tag" style={{ color: info.color }}>
                {info.label}
              </span>
            );
          })}
        </div>
      )}

      <h3>{insight.title}</h3>
      {insight.description && <p className="brief-lead">{insight.description}</p>}

      {insight.whyNow && (
        <div className="detail-section">
          <div className="detail-section-label">Por que agora</div>
          <p className="brief-para">{insight.whyNow}</p>
        </div>
      )}

      {insight.soWhat && (
        <div className="detail-section">
          <div className="detail-section-label">E daí?</div>
          <p className="brief-para">{insight.soWhat}</p>
        </div>
      )}

      {IMPACT_KEYS.some((key) => insight.impact[key]) && (
        <div className="detail-section">
          <div className="detail-section-label">Impacto pro negócio</div>
          <ul className="ent-impact-list">
            {IMPACT_KEYS.map((key) => {
              const value = insight.impact[key];
              if (!value) return null;
              return (
                <li key={key} className="ent-impact-item">
                  <span className="ent-impact-label">{IMPACT_LABELS[key]}</span>
                  <span className="ent-impact-value">{value}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {sources.length > 0 && (
        <div className="detail-section">
          <div className="detail-section-label">Fontes que sustentam</div>
          <ul className="reason-chain">
            {sources.map((item) => (
              <li key={item.id}>
                <span
                  className="reason-dot"
                  style={{ background: topicColor(item.topic, topics) }}
                  title={item.topic}
                />
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noopener noreferrer">
                    {item.title}
                  </a>
                ) : (
                  <span>{item.title}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="ent-flagged-by">
        sinalizado por <b>{insight.flaggedBy}</b>
      </div>
    </article>
  );
}
