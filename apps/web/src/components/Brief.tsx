"use client";

import { useMemo } from "react";
import type { GraphNode, InsightNode, Lens, NewsNode } from "@stalo/shared";
import { insightKey, LENS_LEAD_CATEGORY } from "@/lib/ui";
import { InsightStory } from "./InsightStory";

interface BriefProps {
  insights: InsightNode[];
  newsNodes: NewsNode[]; // notícias do scan, para remontar as fontes de cada tese
  savedKeys: Set<string>; // insightKey das ideias já salvas
  hasScanned: boolean; // distingue "ainda não escaneou" de "escaneou sem conexões"
  lens: Lens | null; // lente do workspace: decide a categoria que lidera o brief
  onSave: (node: GraphNode, notes: string) => void;
}

export function Brief({
  insights,
  newsNodes,
  savedKeys,
  hasScanned,
  lens,
  onSave,
}: BriefProps) {
  // ranqueado por lente + evidência: a categoria que a lente lidera sobe ao topo
  // (arquiteturad §7), e dentro disso vale a evidência (mais notícias primeiro).
  // Sem lente, cai no ranqueamento neutro por evidência.
  const ranked = useMemo(() => {
    const leadCat = lens ? LENS_LEAD_CATEGORY[lens] : null;
    return [...insights].sort((a, b) => {
      if (leadCat) {
        const aLead = a.insightType === leadCat ? 1 : 0;
        const bLead = b.insightType === leadCat ? 1 : 0;
        if (aLead !== bLead) return bLead - aLead;
      }
      return b.related.length - a.related.length;
    });
  }, [insights, lens]);

  const newsById = useMemo(() => {
    const map = new Map<string, NewsNode>();
    for (const n of newsNodes) map.set(n.id, n);
    return map;
  }, [newsNodes]);

  if (ranked.length === 0) {
    return (
      <div className="brief-empty">
        {hasScanned
          ? "O radar não encontrou conexões entre esses temas dessa vez. Ajuste os temas e atualize as notícias de novo."
          : "Adicione temas ao lado e clique em “Atualizar notícias” para o radar montar o brief: as tendências, gaps e oportunidades que cruzam seus temas."}
      </div>
    );
  }

  return (
    <div className="brief">
      <div className="brief-header">
        <h2>Brief do radar</h2>
        <span className="brief-count">
          {ranked.length} {ranked.length === 1 ? "conexão" : "conexões"} entre seus temas
        </span>
      </div>
      <div className="brief-list">
        {/* cada card é a tese + o caminho de raciocínio faseado (InsightStory);
            key={node.id} remonta o card (nota e revelação zeram) ao trocar de scan */}
        {ranked.map((node) => (
          <article className="brief-card" key={node.id}>
            <InsightStory
              node={node}
              sources={node.related
                .map((id) => newsById.get(id))
                .filter((n): n is NewsNode => Boolean(n))}
              saved={savedKeys.has(insightKey(node.insightType, node.title))}
              onSave={onSave}
            />
          </article>
        ))}
      </div>
    </div>
  );
}
