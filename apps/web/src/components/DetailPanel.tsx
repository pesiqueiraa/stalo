"use client";

import { useRef, useState } from "react";
import type { GraphNode, InsightNode } from "@stalo/shared";
import { formatShortDate, labelForType } from "@/lib/ui";
import { useDismiss } from "@/lib/useDismiss";

interface DetailPanelProps {
  node: GraphNode | null;
  alreadySaved: boolean;
  onSave: (node: GraphNode, notes: string) => void;
  onClose: () => void;
}

// Detalhe de um insight, com o campo de nota do usuário. Componente próprio pra
// o texto da nota ser estado local — o pai o remonta via key={node.id}, então a
// nota zera ao trocar de insight sem precisar de effect.
function InsightDetail({
  node,
  alreadySaved,
  onSave,
  onClose,
}: {
  node: InsightNode;
  alreadySaved: boolean;
  onSave: (node: GraphNode, notes: string) => void;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState("");
  return (
    <>
      <span className={`detail-type detail-${node.insightType}`}>
        {labelForType(node.insightType)}
      </span>
      <h3>{node.title}</h3>
      <p>{node.description}</p>
      {!alreadySaved && (
        <textarea
          className="detail-note"
          placeholder="Sua nota (opcional): por que isso importa, o que investigar…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={500}
        />
      )}
      <button className="btn-save" disabled={alreadySaved} onClick={() => onSave(node, notes.trim())}>
        {alreadySaved ? "Já salva" : "Salvar ideia"}
      </button>
      <button className="btn-close" onClick={onClose}>
        Fechar
      </button>
    </>
  );
}

export function DetailPanel({ node, alreadySaved, onSave, onClose }: DetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // fecha ao clicar/tocar fora da box (grafo vazio, laterais, header…) ou Esc.
  // ignora `.node`: clicar noutro nó apenas troca o conteúdo, sem fechar/reabrir.
  useDismiss(panelRef, onClose, !!node, ".node");

  return (
    <div ref={panelRef} className={`detail-panel${node ? " open" : ""}`}>
      {node && node.kind === "insight" && (
        <InsightDetail
          key={node.id}
          node={node}
          alreadySaved={alreadySaved}
          onSave={onSave}
          onClose={onClose}
        />
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
