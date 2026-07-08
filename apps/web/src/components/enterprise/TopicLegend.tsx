"use client";

import { topicColor } from "@/lib/graph";
import type { Topic } from "@stalo/shared";

interface TopicLegendProps {
  topics: Topic[];
}

// Traduz a cor dos pontos de notícia do RadarScope pro tema que eles
// representam — sem isso o "ruído de fundo" do radar não significa nada pra
// quem olha pela primeira vez.
export function TopicLegend({ topics }: TopicLegendProps) {
  const names = topics.map((t) => t.name);
  return (
    <div className="ent-legend">
      {topics.map((topic) => (
        <span key={topic.id} className="ent-legend-item">
          <span className="ent-legend-dot" style={{ background: topicColor(topic.name, names) }} />
          {topic.name}
        </span>
      ))}
    </div>
  );
}
