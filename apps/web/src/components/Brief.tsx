"use client";

import { useMemo, useState } from "react";
import type { GraphNode, InsightNode, NewsNode } from "@stalo/shared";
import { insightKey, labelForType } from "@/lib/ui";
import { topicColor } from "@/lib/graph";

interface BriefProps {
  insights: InsightNode[];
  newsNodes: NewsNode[]; // notícias do scan, para remontar as fontes de cada tese
  topics: string[]; // ordem = cor por tema
  savedKeys: Set<string>; // insightKey das ideias já salvas
  hasScanned: boolean; // distingue "ainda não escaneou" de "escaneou sem conexões"
  onSave: (node: GraphNode, notes: string) => void;
}

// Um card do brief. Nota é estado local (como no DetailPanel): o pai remonta via
// key={node.id}, então zera ao trocar sem effect.
function BriefCard({
  node,
  sources,
  topics,
  saved,
  onSave,
}: {
  node: InsightNode;
  sources: NewsNode[];
  topics: string[];
  saved: boolean;
  onSave: (node: GraphNode, notes: string) => void;
}) {
  const [notes, setNotes] = useState("");
  return (
    <article className="brief-card">
      <div className="brief-card-head">
        <span className={`detail-type detail-${node.insightType}`}>
          {labelForType(node.insightType)}
        </span>
      </div>

      <h3>{node.title}</h3>
      {node.description && <p className="brief-lead">{node.description}</p>}

      {node.whyNow && (
        <div className="detail-section">
          <div className="detail-section-label">Por que agora</div>
          <p className="brief-para">{node.whyNow}</p>
        </div>
      )}

      {node.soWhat && (
        <div className="detail-section">
          <div className="detail-section-label">E daí?</div>
          <p className="brief-para">{node.soWhat}</p>
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

      {!saved && (
        <textarea
          className="detail-note"
          placeholder="Sua nota (opcional): por que isso importa, o que investigar…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          maxLength={500}
        />
      )}
      <button className="btn-save" disabled={saved} onClick={() => onSave(node, notes.trim())}>
        {saved ? "Já salva" : "Salvar ideia"}
      </button>
    </article>
  );
}

export function Brief({
  insights,
  newsNodes,
  topics,
  savedKeys,
  hasScanned,
  onSave,
}: BriefProps) {
  // ranqueado por evidência: mais notícias sustentando a tese primeiro.
  const ranked = useMemo(
    () => [...insights].sort((a, b) => b.related.length - a.related.length),
    [insights],
  );

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
        {ranked.map((node) => (
          <BriefCard
            key={node.id}
            node={node}
            sources={node.related
              .map((id) => newsById.get(id))
              .filter((n): n is NewsNode => Boolean(n))}
            topics={topics}
            saved={savedKeys.has(insightKey(node.insightType, node.title))}
            onSave={onSave}
          />
        ))}
      </div>
    </div>
  );
}
