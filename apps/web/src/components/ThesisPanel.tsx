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

interface ThesisPanelProps {
  // a tese é o refino opcional: "quero construir [build] para [forWhom]"
  thesisBuild: string;
  thesisFor: string;
  onThesisBuildChange: (v: string) => void;
  onThesisForChange: (v: string) => void;
  // setores são o input principal — o MEIO pelo qual a IA acha o ângulo
  topics: Topic[];
  newsCounts: Record<string, number> | null;
  onAddTopic: (name: string) => void;
  onRemoveTopic: (id: string) => void;
  onScan: () => void; // "Gerar veredito"
  loading: boolean;
  error: string | null;
  days: number | null;
  onDaysChange: (days: number | null) => void;
  settings: GraphSettings;
  onSettingsChange: (settings: GraphSettings) => void;
  // legenda de tipos + configurações do grafo só pesam quando a evidência está
  // à vista; fora dela, tirar do painel deixa a tese ser o foco inequívoco.
  showGraphControls: boolean;
}

type BoolSettingKey = "showLinks" | "showEntityLinks" | "showLabels";

const SETTING_OPTIONS: { key: BoolSettingKey; label: string }[] = [
  { key: "showLinks", label: "Linhas do grafo" },
  { key: "showEntityLinks", label: "Arestas entre notícias" },
  { key: "showLabels", label: "Rótulos das notícias" },
];

export function ThesisPanel({
  thesisBuild,
  thesisFor,
  onThesisBuildChange,
  onThesisForChange,
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
  showGraphControls,
}: ThesisPanelProps) {
  const [input, setInput] = useState("");

  function submitTopic() {
    if (!input.trim()) return;
    onAddTopic(input);
    setInput("");
  }

  return (
    <div className="panel" id="panel-topics">
      <h2>Setores para cruzar</h2>

      {/* setores como input principal: o cruzamento é a lente pela qual a IA
          acha o ângulo. Visível por padrão. */}
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
                  title={`${count} ${count === 1 ? "notícia" : "notícias"} nesta evidência`}
                >
                  {count}
                </span>
              )}
              <button title="Remover setor" onClick={() => onRemoveTopic(topic.id)}>
                ×
              </button>
            </span>
          );
        })}
      </div>
      <div className="topic-count">
        {topics.length}/{MAX_TOPICS} setores · até {MAX_TOPICS} por vez
      </div>
      <div className="add-topic">
        <input
          type="text"
          placeholder="Adicionar setor…"
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
        <div className="period-options" role="group" aria-label="Janela de tempo da busca">
          {DAYS_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              className={`period-btn${d === days ? " active" : ""}`}
              aria-pressed={d === days}
              disabled={loading}
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
            <span className="spinner" /> Cruzando as fontes…
          </>
        ) : (
          "Gerar veredito"
        )}
      </button>
      {error && <div className="error-banner">{error}</div>}

      {/* tese como refino opcional: a frase que o founder diz sobre a própria
          ideia ("quero construir [X] para [Y]") afina o ângulo do veredito.
          Recolhida por padrão. */}
      <details className="refine">
        <summary>Descrever sua tese (opcional)</summary>
        <div className="thesis-compose">
          <label className="thesis-line">
            <span className="thesis-lead">Quero construir</span>
            <textarea
              className="thesis-field"
              placeholder="crédito de capital de giro na entressafra"
              value={thesisBuild}
              onChange={(e) => onThesisBuildChange(e.target.value)}
              rows={2}
              maxLength={140}
            />
          </label>
          <label className="thesis-line">
            <span className="thesis-lead">para</span>
            <textarea
              className="thesis-field"
              placeholder="pequeno e médio produtor de café"
              value={thesisFor}
              onChange={(e) => onThesisForChange(e.target.value)}
              rows={2}
              maxLength={140}
            />
          </label>
        </div>
      </details>

      {/* legenda de tipos + configurações do grafo: controles da evidência.
          Só aparecem quando a view Evidência está ativa, pra não competir com a
          tese no resto do tempo. */}
      {showGraphControls && (
        <>
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
            <summary>⚙ Configurações do grafo</summary>
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
        </>
      )}
    </div>
  );
}
