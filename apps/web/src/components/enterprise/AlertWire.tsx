"use client";

import { useMemo, useState } from "react";
import { InsightGlyph } from "@/components/InsightGlyph";
import { ENTERPRISE_TAG_INFO, type EnterpriseRadar } from "@/lib/enterpriseMock";

function relativeLabel(ms: number) {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.floor(hours / 24)}d`;
}

interface AlertWireProps {
  radar: EnterpriseRadar;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

// Feed ao vivo, estilo terminal de mercado: mais recente primeiro, por
// `detectedAt` real do mock (o mesmo histórico que alimenta o ScanTimeline —
// não é mais um hack de "index * minutos"). Seleção é bidirecional com o
// RadarScope: clicar aqui ou lá acende os dois. Insights com `recurrence > 1`
// ganham um selo — a mesma tese sinalizada de novo em varreduras seguintes.
export function AlertWire({ radar, selectedId, onSelect }: AlertWireProps) {
  const [now] = useState(() => Date.now());

  const ranked = useMemo(
    () =>
      [...radar.insights].sort(
        (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
      ),
    [radar.insights],
  );

  return (
    <div className="ent-wire">
      <div className="ent-wire-head">
        <span className="ent-live-dot" aria-hidden="true" />
        AO VIVO
        <span className="ent-wire-count">
          {ranked.length} {ranked.length === 1 ? "conexão" : "conexões"}
        </span>
      </div>

      <div className="ent-wire-list">
        {ranked.map((insight) => {
          const selected = insight.id === selectedId;
          const isThreat = insight.tags.includes("ameaça");
          const elapsed = now - new Date(insight.detectedAt).getTime();
          return (
            <button
              key={insight.id}
              type="button"
              className={`ent-wire-row${selected ? " active" : ""}${isThreat ? " threat" : ""}`}
              onClick={() => onSelect(insight.id)}
            >
              <span className="ent-wire-time">{relativeLabel(elapsed)}</span>
              <InsightGlyph type={insight.type} size={16} />
              <span className="ent-wire-body">
                <span className="ent-wire-title">{insight.title}</span>
                <span className="ent-wire-meta">
                  {insight.tags.map((tag) => (
                    <span key={tag} className="ent-wire-tag" style={{ color: ENTERPRISE_TAG_INFO[tag].color }}>
                      {ENTERPRISE_TAG_INFO[tag].label}
                    </span>
                  ))}
                  {insight.recurrence > 1 && (
                    <span className="ent-wire-recurrence">visto {insight.recurrence}x</span>
                  )}
                  <span className="ent-wire-by">sinalizado por {insight.flaggedBy}</span>
                </span>
              </span>
            </button>
          );
        })}
        {ranked.length === 0 && <p className="ent-wire-empty">Nenhuma conexão nesse radar ainda.</p>}
      </div>
      <span className="ent-wire-since" aria-hidden="true">
        atualizado às {new Date(now).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
      </span>
    </div>
  );
}
