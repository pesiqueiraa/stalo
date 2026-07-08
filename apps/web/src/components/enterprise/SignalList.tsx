"use client";

import { useMemo } from "react";
import { InsightGlyph } from "@/components/InsightGlyph";
import {
  ENTERPRISE_TAG_INFO,
  IMPACT_LABELS,
  type EnterpriseImpact,
  type EnterpriseRadar,
} from "@/lib/enterpriseMock";
import { labelForType } from "@/lib/ui";

const IMPACT_KEYS = Object.keys(IMPACT_LABELS) as (keyof EnterpriseImpact)[];

interface SignalListProps {
  radar: EnterpriseRadar;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

// Modo "Lista": todos os insights do radar numa tabela densa e escaneável —
// uma linha por sinal, não um card cheio de texto empilhado. O conteúdo
// completo (rationale, por que agora, e daí, fontes) só aparece no
// SignalDrawer ao clicar — o mesmo painel que a "Sala" usa, então o clique
// funciona igual nos dois modos.
export function SignalList({ radar, selectedId, onSelect }: SignalListProps) {
  // ranqueado por recorrência (sinal mais confirmado primeiro) e, no empate,
  // por evidência — prioridade de leitura, não só recência.
  const ranked = useMemo(
    () =>
      [...radar.insights].sort((a, b) => {
        if (b.recurrence !== a.recurrence) return b.recurrence - a.recurrence;
        return b.related_items.length - a.related_items.length;
      }),
    [radar.insights],
  );

  if (ranked.length === 0) {
    return <div className="ent-signal-empty">Esse radar ainda não tem conexões mapeadas.</div>;
  }

  return (
    <div className="ent-signal-list">
      <div className="ent-signal-head">
        <span>Sinal</span>
        <span>Tags</span>
        <span>Impacto</span>
        <span>Recorrência</span>
      </div>
      {ranked.map((insight) => {
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
                <span className="ent-signal-type">{labelForType(insight.type)}</span>
              </span>
            </span>
            <span className="ent-signal-tags">
              {insight.tags.length > 0
                ? insight.tags.map((tag) => (
                    <span key={tag} className="ent-tag" style={{ color: ENTERPRISE_TAG_INFO[tag].color }}>
                      {ENTERPRISE_TAG_INFO[tag].label}
                    </span>
                  ))
                : <span className="ent-signal-dash">—</span>}
            </span>
            <span className="ent-signal-impact">
              {impactDims.length > 0 ? impactDims.map((k) => IMPACT_LABELS[k]).join(" · ") : "—"}
            </span>
            <span className="ent-signal-recurrence">
              {insight.recurrence > 1 ? `${insight.recurrence}x` : "novo"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
