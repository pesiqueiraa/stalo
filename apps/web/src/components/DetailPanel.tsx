"use client";

import { useRef } from "react";
import type { GraphNode, NewsNode } from "@stalo/shared";
import { formatShortDate } from "@/lib/ui";
import { useDismiss } from "@/lib/useDismiss";
import { InsightStory } from "./InsightStory";

interface DetailPanelProps {
  node: GraphNode | null;
  newsNodes: NewsNode[]; // notícias do scan, para resolver as relacionadas do insight
  alreadySaved: boolean;
  onSave: (node: GraphNode, notes: string) => void;
  onClose: () => void;
}

export function DetailPanel({ node, newsNodes, alreadySaved, onSave, onClose }: DetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // fecha ao clicar/tocar fora da box (grafo vazio, laterais, header…) ou Esc.
  // ignora `.node`: clicar noutro nó apenas troca o conteúdo, sem fechar/reabrir.
  useDismiss(panelRef, onClose, !!node, ".node");

  return (
    <div ref={panelRef} className={`detail-panel${node ? " open" : ""}`}>
      {node && node.kind === "insight" && (
        // key={node.id} remonta ao trocar de insight: nota e revelação zeram
        <div key={node.id}>
          <InsightStory
            node={node}
            sources={newsNodes.filter((n) => node.related.includes(n.id))}
            saved={alreadySaved}
            onSave={onSave}
          />
          <button className="btn-close" style={{ marginTop: 10 }} onClick={onClose}>
            Fechar
          </button>
        </div>
      )}
      {node && node.kind === "news" && (
        <>
          <span className="detail-type" style={{ color: node.color }}>
            {node.topic}
          </span>
          <h3>{node.title}</h3>
          <p>{node.summary}</p>
          {(node.source || node.publishedAt) && (
            <p className="detail-source">
              {node.source && `Fonte: ${node.source}`}
              {node.source && node.publishedAt && " · "}
              {node.publishedAt && formatShortDate(node.publishedAt)}
            </p>
          )}
          <div style={{ marginTop: 10 }}>
            {node.url && (
              <a className="btn-link" href={node.url} target="_blank" rel="noopener noreferrer">
                Ver notícia ↗
              </a>
            )}
            <button className="btn-close" style={{ marginLeft: 8 }} onClick={onClose}>
              Fechar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
