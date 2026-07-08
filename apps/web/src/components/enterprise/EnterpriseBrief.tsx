"use client";

import {
  EVENT_TYPE_INFO,
  IMPACT_LABELS,
  PRIORITY_INFO,
  READING_FOR_TYPE,
  READING_INFO,
  type EnterpriseImpact,
  type EnterpriseInsight,
  type EnterpriseNewsItem,
  type PriorityCall,
} from "@/lib/enterpriseMock";
import { topicColor } from "@/lib/graph";

const IMPACT_KEYS = Object.keys(IMPACT_LABELS) as (keyof EnterpriseImpact)[];

// Card completo de um insight: usado no SignalDrawer (Sala e Lista abrem o
// mesmo painel de detalhe ao clicar um sinal). Mesma linguagem visual do
// Brief.tsx pessoal (reaproveita .brief-card/.detail-type/.detail-section de
// globals.css), com as somas próprias do tier empresa — leitura estratégica
// (camada 2) no lugar do rótulo universal, prioridade com os motivos, impacto
// pro negócio, tipo de evento (camada 1) em cada fonte e quem sinalizou.
export function EnterpriseBriefCard({
  insight,
  sources,
  topics,
  priority,
}: {
  insight: EnterpriseInsight;
  sources: EnterpriseNewsItem[];
  topics: string[];
  priority: PriorityCall;
}) {
  return (
    <article className="brief-card">
      <div className="brief-card-head ent-card-head">
        <span className={`detail-type detail-${insight.type}`}>
          {READING_INFO[READING_FOR_TYPE[insight.type]].label}
        </span>
        {insight.threat && (
          <span className="ent-tag" style={{ color: READING_INFO.ameaca.color }}>
            {READING_INFO.ameaca.label}
          </span>
        )}
        <span className={`ent-prio ${priority.level}`}>prioridade {PRIORITY_INFO[priority.level].label.toLowerCase()}</span>
      </div>
      {priority.reasons.length > 0 && (
        <p className="ent-prio-why">{priority.reasons.join(" · ")}</p>
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
          <div className="detail-section-label">Eventos que sustentam</div>
          <ul className="reason-chain">
            {sources.map((item) => (
              <li key={item.id}>
                <span
                  className="reason-dot"
                  style={{ background: topicColor(item.topic, topics) }}
                  title={item.topic}
                />
                <span className="ent-event-chip" title={EVENT_TYPE_INFO[item.eventType].label}>
                  {EVENT_TYPE_INFO[item.eventType].short}
                </span>
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
