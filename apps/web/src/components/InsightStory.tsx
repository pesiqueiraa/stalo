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
// notícias → ação (salvar). Cada etapa abre e fecha de forma independente
// (accordion) — abrir uma não mexe nas outras. É o mesmo conteúdo de antes, só
// faseado; nada é removido. Usado pelo Brief (card) e pelo DetailPanel do
// grafo. O texto da nota é estado local: o pai remonta via key={node.id},
// então zera ao trocar de insight sem precisar de effect.
export function InsightStory({ node, sources, saved, onSave }: InsightStoryProps) {
  const [notes, setNotes] = useState("");
  // etapas abertas (por key). A 1ª ("O padrão") nasce aberta; cada uma abre e
  // fecha por conta própria.
  const [open, setOpen] = useState<Set<string>>(() => new Set(["padrao"]));
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

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
      content: <NewsTimeline items={chronological} />,
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
  if (chronological.length > 0) {
    steps.push({
      key: "noticias",
      label: "Notícias",
      content: (
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
      ),
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
          const isOpen = open.has(step.key);
          return (
            <div className={`story-step${isOpen ? " open" : ""}`} key={step.key}>
              <button
                type="button"
                className="story-step-head"
                aria-expanded={isOpen}
                onClick={() => toggle(step.key)}
              >
                <span className="story-step-num">{numLabel}</span> {step.label}
                <span className="story-step-plus" aria-hidden="true">
                  {isOpen ? "−" : "+"}
                </span>
              </button>
              {isOpen && <div className="story-step-body">{step.content}</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}
