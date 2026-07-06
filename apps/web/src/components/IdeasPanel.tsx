"use client";

import { useState } from "react";
import type { SavedIdea, Topic } from "@stalo/shared";
import { deepDiveLabel, labelForType } from "@/lib/ui";
import { topicColor } from "@/lib/graph";

interface IdeasPanelProps {
  ideas: SavedIdea[];
  topics: Topic[];
  divingId: string | null; // ideia com mergulho em andamento (loading)
  onRemove: (id: string) => void;
  onHoverIdea: (id: string | null) => void;
  onDive: (id: string) => void; // gera o mergulho
  onOpenDive: (id: string) => void; // abre um mergulho já gerado
  onCollapse: () => void;
}

type Tab = "salvas" | "Deep Dive";

export function IdeasPanel({
  ideas,
  topics,
  divingId,
  onRemove,
  onHoverIdea,
  onDive,
  onOpenDive,
  onCollapse,
}: IdeasPanelProps) {
  const [tab, setTab] = useState<Tab>("salvas");
  const topicNames = topics.map((t) => t.name);

  const dived = ideas.filter((i) => i.deepDive);
  const shown = tab === "Deep Dive" ? dived : ideas;

  return (
    <div className="panel" id="panel-ideas">
      <div className="panel-ideas-header">
        <h2>Minhas ideias salvas</h2>
        <button
          className="ideas-collapse"
          onClick={onCollapse}
          title="Ocultar painel"
          aria-label="Ocultar painel de ideias salvas"
        >
          ›
        </button>
      </div>

      <div className="ideas-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "salvas"}
          className={`ideas-tab${tab === "salvas" ? " active" : ""}`}
          onClick={() => setTab("salvas")}
        >
          Salvas ({ideas.length})
        </button>
        <button
          role="tab"
          aria-selected={tab === "Deep Dive"}
          className={`ideas-tab${tab === "Deep Dive" ? " active" : ""}`}
          onClick={() => setTab("Deep Dive")}
        >
          Deep Dive ({dived.length})
        </button>
      </div>

      {shown.length === 0 ? (
        <div className="empty-ideas">
          {tab === "Deep Dive"
            ? "Nenhuma ideia mergulhada ainda. Numa ideia salva, clique em “Mergulhar” para gerar o relatório fundo."
            : "Nenhuma ideia salva ainda. Quando o radar sinalizar uma tendência, gap ou oportunidade, clique no nó âmbar e salve aqui."}
        </div>
      ) : (
        shown.map((idea) => (
          <div
            className="idea-card"
            key={idea.id}
            tabIndex={0}
            onMouseEnter={() => onHoverIdea(idea.id)}
            onMouseLeave={() => onHoverIdea(null)}
            onFocus={() => onHoverIdea(idea.id)}
            onBlur={() => onHoverIdea(null)}
          >
            <span className={`detail-type detail-${idea.type || "oportunidade"}`}>
              {labelForType(idea.type)}
            </span>
            <button className="idea-remove" title="Remover" onClick={() => onRemove(idea.id)}>
              ×
            </button>
            <h4>{idea.title}</h4>
            <p>{idea.description}</p>
            {idea.notes && <p className="idea-note">{idea.notes}</p>}

            {/* teaser "Cruza" só na aba Salvas — na aba Deep Dive o cruzamento
                já está dentro do deep dive, então mostrá-lo aqui seria redundante */}
            {tab === "salvas" && idea.relatedItems?.length > 0 && (
              <div className="detail-section">
                <div className="detail-section-label">Cruza</div>
                <ul className="reason-chain">
                  {idea.relatedItems.map((item) => (
                    <li key={item.id}>
                      <span
                        className="reason-dot"
                        style={{ background: topicColor(item.topic, topicNames) }}
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

            {idea.deepDive ? (
              <button className="btn-deepdive is-dived" onClick={() => onOpenDive(idea.id)}>
                Ver mergulho ↗
              </button>
            ) : divingId === idea.id ? (
              <button className="btn-deepdive" disabled>
                <span className="spinner" /> Mergulhando…
              </button>
            ) : (
              <button
                className="btn-deepdive"
                onClick={() => onDive(idea.id)}
                disabled={divingId !== null}
              >
                {deepDiveLabel(idea.type)}
              </button>
            )}

            <time>
              salvo em{" "}
              {new Date(idea.savedAt).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "short",
              })}
            </time>
          </div>
        ))
      )}
    </div>
  );
}
