"use client";

import { useMemo } from "react";
import { InsightGlyph } from "@/components/InsightGlyph";
import {
  EVENT_TYPE_INFO,
  IMPACT_LABELS,
  PRIORITY_INFO,
  READING_INFO,
  computePriority,
  eventMix,
  readingsFor,
  type EnterpriseImpact,
  type EnterpriseRadar,
} from "@/lib/enterpriseMock";

const IMPACT_KEYS = Object.keys(IMPACT_LABELS) as (keyof EnterpriseImpact)[];

interface SignalListProps {
  radar: EnterpriseRadar;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

// Modo "Lista": todos os insights do radar numa tabela densa e escaneável —
// uma linha por sinal, não um card cheio de texto empilhado. As colunas seguem
// as duas camadas da taxonomia: Eventos (camada 1, o fato) e Leitura (camada 2,
// a interpretação), fechando com a prioridade heurística. O conteúdo completo
// (rationale, por que agora, e daí, fontes) só aparece no SignalDrawer ao
// clicar — o mesmo painel que a "Sala" usa.
export function SignalList({ radar, selectedId, onSelect }: SignalListProps) {
  // ranqueado pela prioridade (score contínuo, não só o nível) e, no empate,
  // por recorrência — o topo da lista é o que o time deveria olhar primeiro.
  const ranked = useMemo(
    () =>
      radar.insights
        .map((insight) => ({
          insight,
          priority: computePriority(insight, radar),
          events: eventMix(insight, radar),
        }))
        .sort((a, b) => {
          if (b.priority.score !== a.priority.score) return b.priority.score - a.priority.score;
          return b.insight.recurrence - a.insight.recurrence;
        }),
    [radar],
  );

  if (ranked.length === 0) {
    return <div className="ent-signal-empty">Esse radar ainda não tem conexões mapeadas.</div>;
  }

  return (
    <div className="ent-signal-list">
      <div className="ent-signal-head">
        <span>Sinal</span>
        <span>Eventos</span>
        <span>Leitura</span>
        <span>Impacto</span>
        <span>Prioridade</span>
      </div>
      {ranked.map(({ insight, priority, events }) => {
        const selected = insight.id === selectedId;
        const impactDims = IMPACT_KEYS.filter((key) => insight.impact[key]);
        return (
          <button
            key={insight.id}
            type="button"
            className={`ent-signal-row${selected ? " active" : ""}`}
            onClick={() => onSelect(insight.id)}
          >
            <span className="ent-signal-main">
              <InsightGlyph type={insight.type} size={18} />
              <span className="ent-signal-text">
                <span className="ent-signal-title">{insight.title}</span>
                <span className="ent-signal-type">
                  {insight.recurrence > 1 ? `visto ${insight.recurrence}x` : "novo"} ·{" "}
                  {insight.related_items.length}{" "}
                  {insight.related_items.length === 1 ? "fonte" : "fontes"}
                </span>
              </span>
            </span>
            <span className="ent-signal-events">
              {events.length > 0
                ? events.map(({ type, count }) => (
                    <span key={type} className="ent-event-chip" title={EVENT_TYPE_INFO[type].label}>
                      {EVENT_TYPE_INFO[type].short}
                      {count > 1 && <span className="ent-event-count">{count}×</span>}
                    </span>
                  ))
                : <span className="ent-signal-dash">—</span>}
            </span>
            <span className="ent-signal-tags">
              {readingsFor(insight).map((reading) => (
                <span
                  key={reading}
                  className="ent-tag"
                  style={{ color: READING_INFO[reading].color }}
                  title={READING_INFO[reading].label}
                >
                  {READING_INFO[reading].short}
                </span>
              ))}
            </span>
            <span className="ent-signal-impact">
              {impactDims.length > 0 ? impactDims.map((k) => IMPACT_LABELS[k]).join(" · ") : "—"}
            </span>
            <span className="ent-signal-prio">
              <span
                className={`ent-prio ${priority.level}`}
                title={priority.reasons.join(" · ") || undefined}
              >
                {PRIORITY_INFO[priority.level].label}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
