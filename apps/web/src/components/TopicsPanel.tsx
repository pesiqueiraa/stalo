"use client";

import { useState } from "react";
import { TOPIC_COLORS } from "@/lib/graph";
import type { InsightType, Topic } from "@stalo/shared";
import { labelForType } from "@/lib/ui";
import { SPREAD_MAX, SPREAD_MIN, type GraphSettings } from "@/lib/settings";
import { InsightGlyph } from "./InsightGlyph";

const INSIGHT_TYPES: InsightType[] = ["tendencia", "gap", "oportunidade"];

const MAX_TOPICS = 5;
const DAYS_OPTIONS = [30, 60, 90];

interface TopicsPanelProps {
  topics: Topic[];
  // notícias que cada tema gerou no scan atual (chave = nome do tema); null =
  // ainda não há scan pra contar. É atividade DESTE scan, não "tendência" —
  // rótulo de tendência exigiria histórico de scans, que ainda não existe.
  newsCounts: Record<string, number> | null;
  onAddTopic: (name: string) => void;
  onRemoveTopic: (id: string) => void;
  onScan: () => void;
  loading: boolean;
  error: string | null;
  days: number | null;
  onDaysChange: (days: number | null) => void;
  settings: GraphSettings;
  onSettingsChange: (settings: GraphSettings) => void;
}

// chaves booleanas de GraphSettings (as que viram checkbox)
type BoolSettingKey = "showLinks" | "showEntityLinks" | "showLabels";

// rótulos e ordem dos toggles de visualização do grafo
const SETTING_OPTIONS: { key: BoolSettingKey; label: string }[] = [
  { key: "showLinks", label: "Linhas do grafo" },
  { key: "showEntityLinks", label: "Arestas entre notícias" },
  { key: "showLabels", label: "Rótulos das notícias" },
];

export function TopicsPanel({
  topics,
  newsCounts,
  onAddTopic,
  onRemoveTopic,
  onScan,
  loading,
  error,
  days,
  onDaysChange,
  settings,
  onSettingsChange,
}: TopicsPanelProps) {
  const [input, setInput] = useState("");

  function submitTopic() {
    if (!input.trim()) return;
    onAddTopic(input);
    setInput("");
  }

  return (
    <div className="panel" id="panel-topics">
      <h2>Temas monitorados</h2>
      <div id="topics-list">
        {topics.map((topic, idx) => {
          const count = newsCounts?.[topic.name];
          return (
            <span className="topic-chip" key={topic.id}>
              <span
                className="dot"
                style={{ background: TOPIC_COLORS[idx % TOPIC_COLORS.length] }}
              />
              {topic.name}
              {count !== undefined && (
                <span
                  className="chip-count"
                  title={`${count} ${count === 1 ? "notícia" : "notícias"} neste scan`}
                >
                  {count}
                </span>
              )}
              <button title="Remover tema" onClick={() => onRemoveTopic(topic.id)}>
                ×
              </button>
            </span>
          );
        })}
      </div>
      <div className="topic-count">
        {topics.length}/{MAX_TOPICS} temas · até {MAX_TOPICS} por vez, para manter a análise
        focada
      </div>
      <div className="add-topic">
        <input
          type="text"
          placeholder="Adicionar tema…"
          maxLength={40}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitTopic();
          }}
        />
        <button onClick={submitTopic} disabled={topics.length >= MAX_TOPICS}>
          +
        </button>
      </div>
      <div className="period">
        <div className="period-label">Buscar notícias dos últimos</div>
        <div className="period-options" role="group" aria-label="Janela de tempo do scan">
          {DAYS_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              className={`period-btn${d === days ? " active" : ""}`}
              aria-pressed={d === days}
              disabled={loading}
              // clicar no período ativo desmarca (null = sem limite de data)
              onClick={() => onDaysChange(d === days ? null : d)}
            >
              {d} dias
            </button>
          ))}
        </div>
        <div className="period-hint">
          {days === null
            ? "Sem limite de data — pode trazer notícias mais antigas."
            : "Clique no período ativo para tirar o limite de data."}
        </div>
      </div>
      <button className="btn-scan" onClick={onScan} disabled={loading}>
        {loading ? (
          <>
            <span className="spinner" /> Buscando…
          </>
        ) : (
          "Atualizar notícias"
        )}
      </button>
      {error && <div className="error-banner">{error}</div>}

      {/* legenda só dos tipos de insight — as cores dos temas já aparecem nos
          chips de "Temas monitorados", então repeti-las aqui seria redundante.
          Aqui o valor é mapear forma+cor de cada tipo, que não aparece em outro lugar. */}
      <div className="legend">
        <h2 style={{ marginBottom: 8 }}>Tipos de insight</h2>
        {INSIGHT_TYPES.map((type) => (
          <div className="legend-item" key={type}>
            <InsightGlyph type={type} />
            {labelForType(type)}
          </div>
        ))}
      </div>

      <details className="settings">
        <summary>⚙ Configurações</summary>
        {SETTING_OPTIONS.map(({ key, label }) => (
          <label className="setting-row" key={key}>
            <input
              type="checkbox"
              checked={settings[key]}
              onChange={(e) => onSettingsChange({ ...settings, [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
        <div className="setting-slider">
          <div className="setting-slider-label">Espaçamento</div>
          <input
            type="range"
            min={SPREAD_MIN}
            max={SPREAD_MAX}
            step={0.1}
            value={settings.spread}
            aria-label="Espaçamento do grafo"
            onChange={(e) => onSettingsChange({ ...settings, spread: Number(e.target.value) })}
          />
          <div className="setting-slider-ends">
            <span>juntar</span>
            <span>separar</span>
          </div>
        </div>
      </details>
    </div>
  );
}
