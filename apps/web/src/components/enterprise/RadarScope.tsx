"use client";

import { useMemo } from "react";
import { INSIGHT_COLORS, topicColor } from "@/lib/graph";
import { diamondPath, innerGlyphPath } from "@/lib/shapes";
import { PRIORITY_INFO, computePriority, type EnterpriseRadar } from "@/lib/enterpriseMock";

const CX = 220;
const CY = 220;
const RINGS = [60, 110, 160];
const NEWS_R = [161, 166, 168, 163]; // pequena variação de raio, pra não ficarem num círculo perfeito

interface RadarScopeProps {
  radar: EnterpriseRadar;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

// O radar grande da "sala de situação": não é decoração, é a interface — cada
// insight é um glifo real (mesma forma/cor do produto pessoal, via lib/shapes.ts
// e lib/graph.ts) clicável, posicionado mais perto do centro quanto mais
// evidência (fontes) sustenta a tese. Notícias cruas viram ruído de fundo na
// borda. O que os anéis significam vai numa legenda fora do SVG (ver
// .ent-scope-caption em (shell)/page.tsx) — texto sobreposto nos próprios
// anéis colidia com os nós de insight no topo do radar.
export function RadarScope({ radar, selectedId, onSelect }: RadarScopeProps) {
  const topics = useMemo(() => radar.topics.map((t) => t.name), [radar.topics]);

  const maxSources = Math.max(1, ...radar.insights.map((i) => i.related_items.length));

  const insightPositions = useMemo(() => {
    const n = radar.insights.length || 1;
    return radar.insights.map((insight, i) => {
      const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const strength = insight.related_items.length / maxSources; // 0..1
      const radius = 158 - strength * 84; // mais evidência = mais perto do centro
      return {
        insight,
        x: CX + Math.cos(angle) * radius,
        y: CY + Math.sin(angle) * radius,
      };
    });
  }, [radar.insights, maxSources]);

  const newsPositions = useMemo(() => {
    const n = radar.items.length || 1;
    return radar.items.map((item, i) => {
      const angle = (i / n) * Math.PI * 2;
      const radius = NEWS_R[i % NEWS_R.length];
      return {
        item,
        x: CX + Math.cos(angle) * radius,
        y: CY + Math.sin(angle) * radius,
      };
    });
  }, [radar.items]);

  return (
    <div className="ent-scope">
      <div className="ent-scope-sweep" aria-hidden="true" />
      <svg className="ent-scope-svg" viewBox="0 0 440 440" role="img" aria-label={`Radar ao vivo — ${radar.name}`}>
        <g fill="none" stroke="rgba(122,152,194,0.14)">
          {RINGS.map((r) => (
            <circle key={r} cx={CX} cy={CY} r={r} strokeDasharray={r === RINGS[RINGS.length - 1] ? "2 6" : undefined} />
          ))}
        </g>
        <g stroke="rgba(122,152,194,0.08)">
          <line x1={CX - 200} y1={CY} x2={CX + 200} y2={CY} />
          <line x1={CX} y1={CY - 200} x2={CX} y2={CY + 200} />
        </g>

        <circle cx={CX} cy={CY} r="4" fill="var(--ent-accent)" />
        <circle className="ent-scope-hub" cx={CX} cy={CY} r="10" fill="var(--ent-accent)" />

        {/* notícias: ruído de fundo, cor por tema */}
        {newsPositions.map(({ item, x, y }) => (
          <circle key={item.id} cx={x} cy={y} r={2.4} fill={topicColor(item.topic, topics)} opacity={0.55}>
            <title>{item.title}</title>
          </circle>
        ))}

        {/* insights: o sinal em si — glifo real, clicável */}
        {insightPositions.map(({ insight, x, y }) => {
          const color = INSIGHT_COLORS[insight.type];
          const selected = insight.id === selectedId;
          const isThreat = insight.threat;
          const priority = computePriority(insight, radar);
          const r = 15;
          return (
            <g key={insight.id}>
              {selected && (
                <line
                  x1={CX}
                  y1={CY}
                  x2={x}
                  y2={y}
                  stroke={color}
                  strokeWidth={1}
                  strokeDasharray="2 4"
                  opacity={0.5}
                />
              )}
              <g
                className={`scope-node${selected ? " selected" : ""}${isThreat ? " threat" : ""}`}
                style={{ transform: `translate(${x}px, ${y}px)` }}
                onClick={() => onSelect(insight.id)}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                aria-label={`${insight.title} — prioridade ${PRIORITY_INFO[priority.level].label.toLowerCase()}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") onSelect(insight.id);
                }}
              >
                {insight.recurrence > 1 && (
                  <circle
                    className="scope-node-recurrence-ring"
                    r={r + (isThreat ? 11 : 7)}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.2}
                    opacity={Math.min(0.65, insight.recurrence * 0.12)}
                  />
                )}
                {isThreat && <circle className="scope-node-threat-ring" r={r + 7} fill="none" stroke="#ff6b6b" strokeWidth={1.4} />}
                <circle
                  className="scope-node-glow"
                  r={r + 4}
                  fill={color}
                  opacity={0.12 + Math.min(0.18, insight.recurrence * 0.03)}
                />
                <path d={diamondPath(r)} fill={color} fillOpacity={selected ? 0.32 : 0.16} stroke={color} strokeWidth={selected ? 2 : 1.5} />
                <path d={innerGlyphPath(insight.type, r)} fill={color} fillOpacity={0.95} />
                {/* farol de prioridade alta: pequeno o bastante pra não competir com o glifo */}
                {priority.level === "alta" && (
                  <circle
                    className="scope-node-prio"
                    cx={r * 0.95}
                    cy={-r * 0.95}
                    r={3.4}
                    fill={PRIORITY_INFO.alta.color}
                    stroke="rgba(6, 12, 22, 0.7)"
                    strokeWidth={1}
                  />
                )}
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
