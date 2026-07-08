"use client";

import { topicMix, type EnterpriseRadar } from "@/lib/enterpriseMock";
import { topicColor } from "@/lib/graph";

interface TrendingTopicsProps {
  radar: EnterpriseRadar;
}

// Substitui a legenda passiva de cores por um ranking: mesma função de
// decodificar os pontos do RadarScope (dot = topicColor), mas agora ordenado
// por quantas teses ativas tocam cada tema, com a contagem como rótulo direto
// e um pulso no ponto do tema que recebeu uma tese nova na última varredura —
// "temas em alta" em vez de só "o que essa cor significa".
export function TrendingTopics({ radar }: TrendingTopicsProps) {
  const names = radar.topics.map((t) => t.name);
  const mix = topicMix(radar);
  const maxCount = Math.max(1, ...mix.map((m) => m.count));

  return (
    <div className="ent-trending">
      {mix.map((entry) => (
        <div key={entry.topic} className="ent-trending-row">
          <span
            className={`ent-trending-dot${entry.hot ? " hot" : ""}`}
            style={{ background: topicColor(entry.topic, names) }}
            title={entry.hot ? "tese nova na última varredura" : undefined}
          />
          <span className="ent-trending-name">{entry.topic}</span>
          <span className="ent-trending-track">
            <span
              className="ent-trending-fill"
              style={{
                width: `${(entry.count / maxCount) * 100}%`,
                background: topicColor(entry.topic, names),
              }}
            />
          </span>
          <span className="ent-trending-count">{entry.count}</span>
        </div>
      ))}
    </div>
  );
}
