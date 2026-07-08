"use client";

import { useMemo, useRef } from "react";
import { computePriority, type EnterpriseNewsItem, type EnterpriseRadar } from "@/lib/enterpriseMock";
import { EnterpriseBriefCard } from "./EnterpriseBrief";
import { useDismiss } from "@/lib/useDismiss";

interface SignalDrawerProps {
  radar: EnterpriseRadar;
  selectedId: string | null;
  onClose: () => void;
  onAddComment: (insightId: string, text: string) => void;
}

// Painel de detalhe da sala de situação: abre quando um glifo do RadarScope ou
// uma linha do AlertWire é selecionado. Reaproveita o mesmo card do modo Lista
// (EnterpriseBriefCard) — um único lugar de verdade pro conteúdo do insight.
export function SignalDrawer({ radar, selectedId, onClose, onAddComment }: SignalDrawerProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  useDismiss(ref, onClose, Boolean(selectedId), ".scope-node, .ent-wire-row");

  const insight = selectedId ? radar.insights.find((i) => i.id === selectedId) ?? null : null;
  const topics = useMemo(() => radar.topics.map((t) => t.name), [radar.topics]);

  const sources = useMemo(() => {
    if (!insight) return [];
    const byId = new Map<string, EnterpriseNewsItem>();
    for (const item of radar.items) byId.set(item.id, item);
    return insight.related_items
      .map((id) => byId.get(id))
      .filter((n): n is EnterpriseNewsItem => Boolean(n));
  }, [insight, radar.items]);

  return (
    <div ref={ref} className={`ent-drawer${insight ? " open" : ""}`}>
      {insight && (
        <>
          <button type="button" className="ent-drawer-close" onClick={onClose} aria-label="Fechar detalhe">
            ✕
          </button>
          <EnterpriseBriefCard
            insight={insight}
            sources={sources}
            topics={topics}
            priority={computePriority(insight, radar)}
            onAddComment={(text) => onAddComment(insight.id, text)}
          />
        </>
      )}
    </div>
  );
}
