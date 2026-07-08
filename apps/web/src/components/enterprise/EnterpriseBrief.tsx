"use client";

import { useState } from "react";
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

function formatCommentAt(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Thread de notas do time: uma lista de comentários com autor e data, não um
// campo único sobrescrito — pra um grupo, o que importa é o histórico de quem
// já validou ou descartou a tese, não só a opinião mais recente.
function CommentThread({
  insight,
  onAddComment,
}: {
  insight: EnterpriseInsight;
  onAddComment: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");

  function submit() {
    if (!draft.trim()) return;
    onAddComment(draft);
    setDraft("");
  }

  return (
    <div className="detail-section ent-comments">
      <div className="detail-section-label">Notas do time</div>
      {insight.comments.length > 0 ? (
        <ul className="ent-comment-list">
          {insight.comments.map((c) => (
            <li key={c.id} className="ent-comment">
              <div className="ent-comment-head">
                <span className="ent-comment-author">{c.author}</span>
                <span className="ent-comment-at">{formatCommentAt(c.at)}</span>
              </div>
              <p className="ent-comment-text">{c.text}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ent-comment-empty">Ninguém do time comentou essa tese ainda.</p>
      )}
      <form
        className="ent-comment-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          className="ent-comment-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Adicionar nota: já validou, quer descartar, quer investigar…"
          rows={2}
        />
        <button type="submit" className="ent-comment-submit" disabled={!draft.trim()}>
          Comentar
        </button>
      </form>
    </div>
  );
}

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
  onAddComment,
}: {
  insight: EnterpriseInsight;
  sources: EnterpriseNewsItem[];
  topics: string[];
  priority: PriorityCall;
  onAddComment: (text: string) => void;
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

      <CommentThread insight={insight} onAddComment={onAddComment} />
    </article>
  );
}
