"use client";

import { useState, type ReactNode } from "react";
import type { GraphNode, InsightNode, NewsNode } from "@stalo/shared";
import { formatShortDate, labelForType } from "@/lib/ui";
import { NewsTimeline } from "./NewsTimeline";

interface InsightStoryProps {
  node: InsightNode;
  sources: NewsNode[]; // notícias relacionadas (já resolvidas de node.related)
  saved: boolean;
  onSave: (node: GraphNode, notes: string) => void;
}

function dayTime(iso: string): number | null {
  if (!iso) return null;
  const t = new Date(`${iso}T00:00:00`).getTime();
  return Number.isNaN(t) ? null : t;
}

// O detalhe de um insight como um caminho de raciocínio, não um bloco único:
// padrão (as notícias no tempo) → por que conecta → por que agora → e daí? →
// ação (salvar). Cada etapa é revelada em sequência — clicar numa etapa abre
// tudo até ela. É o mesmo conteúdo de antes, só faseado; nada é removido.
// Usado pelo Brief (card) e pelo DetailPanel do grafo. O texto da nota é
// estado local: o pai remonta via key={node.id}, então zera ao trocar de
// insight sem precisar de effect.
export function InsightStory({ node, sources, saved, onSave }: InsightStoryProps) {
  const [notes, setNotes] = useState("");
  // nº de etapas já reveladas (a 1ª nasce aberta)
  const [revealed, setRevealed] = useState(1);

  // cronológico: o "padrão" se lê no tempo (evento isolado vs. sequência);
  // notícias sem data válida vão pro fim
  const chronological = [...sources].sort((a, b) => {
    const ta = dayTime(a.publishedAt);
    const tb = dayTime(b.publishedAt);
    if (ta === null && tb === null) return 0;
    if (ta === null) return 1;
    if (tb === null) return -1;
    return ta - tb;
  });

  const steps: { key: string; label: string; content: ReactNode }[] = [];

  if (chronological.length > 0) {
    steps.push({
      key: "padrao",
      label: "O padrão",
      content: (
        <>
          <NewsTimeline items={chronological} />
          <ul className="reason-chain">
            {chronological.map((item) => (
              <li key={item.id}>
                <span className="reason-dot" style={{ background: item.color }} title={item.topic} />
                <span>
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noopener noreferrer">
                      {item.title}
                    </a>
                  ) : (
                    <span>{item.title}</span>
                  )}
                  {item.publishedAt && (
                    <span className="reason-date">{formatShortDate(item.publishedAt)}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      ),
    });
  }
  if (node.rationale) {
    steps.push({
      key: "conecta",
      label: "Por que conecta",
      content: <p className="story-para">{node.rationale}</p>,
    });
  }
  if (node.whyNow) {
    steps.push({
      key: "agora",
      label: "Por que agora",
      content: <p className="story-para">{node.whyNow}</p>,
    });
  }
  if (node.soWhat) {
    steps.push({
      key: "edai",
      label: "E daí?",
      content: <p className="story-para">{node.soWhat}</p>,
    });
  }
  steps.push({
    key: "acao",
    label: "Ação",
    content: (
      <>
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
      </>
    ),
  });

  return (
    <>
      <span className={`detail-type detail-${node.insightType}`}>
        {labelForType(node.insightType)}
      </span>
      <h3>{node.title}</h3>
      {node.description && <p className="story-lead">{node.description}</p>}

      <div className="story-steps">
        {steps.map((step, i) => {
          const numLabel = String(i + 1).padStart(2, "0");
          if (i < revealed) {
            return (
              <div className="story-step" key={step.key}>
                <div className="story-step-label">
                  <span className="story-step-num">{numLabel}</span> {step.label}
                </div>
                <div className="story-step-body">{step.content}</div>
              </div>
            );
          }
          return (
            <button
              key={step.key}
              type="button"
              className={`story-step-head${i === revealed ? " next" : ""}`}
              aria-expanded={false}
              onClick={() => setRevealed(i + 1)}
            >
              <span className="story-step-num">{numLabel}</span> {step.label}
              <span className="story-step-plus" aria-hidden="true">
                +
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
