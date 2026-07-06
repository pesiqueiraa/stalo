import type { Graph, GraphLink, InsightNode, InsightType, NewsNode, ScanResult } from "@stalo/shared";

export const TOPIC_COLORS = [
  "#5EC8D8",
  "#E8735F",
  "#9B8FE0",
  "#8FBF8F",
  "#D8C15E",
  "#E85F8C",
];

// paleta neon dos insights (viva, mas contida). Cada tipo também tem uma forma
// própria no grafo — ver GraphCanvas (losango vazado + glifo central).
// Mantenha em sincronia com .detail-tendencia/.detail-gap/.detail-oportunidade
// no globals.css.
export const INSIGHT_COLORS: Record<InsightType, string> = {
  tendencia: "#3DDC97",
  gap: "#FF6B6B",
  oportunidade: "#FFB13D",
};

export function topicColor(topic: string, topics: string[]): string {
  const idx = topics.indexOf(topic);
  return TOPIC_COLORS[(idx >= 0 ? idx : 0) % TOPIC_COLORS.length];
}

export function buildGraph(parsed: ScanResult, topics: string[]): Graph {
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const insights = Array.isArray(parsed.insights) ? parsed.insights : [];

  const newsNodes: NewsNode[] = items.map((it) => ({
    ...it,
    kind: "news",
    title: it.title || "(sem título)",
    summary: it.summary || "",
    source: it.source || "",
    url: it.url || "",
    entities: Array.isArray(it.entities) ? it.entities : [],
    color: topicColor(it.topic, topics),
    r: 9,
  }));

  const insightNodes: InsightNode[] = insights.map((ins) => {
    const insightType = (["tendencia", "gap", "oportunidade"] as const).includes(ins.type)
      ? ins.type
      : "oportunidade";
    return {
      kind: "insight",
      id: ins.id,
      insightType,
      title: ins.title || "(sem título)",
      description: ins.description || "",
      rationale: ins.rationale || "",
      whyNow: ins.whyNow || "",
      soWhat: ins.soWhat || "",
      related: Array.isArray(ins.related_items) ? ins.related_items : [],
      color: INSIGHT_COLORS[insightType],
      r: 14,
    };
  });

  const links: GraphLink[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = (items[i].entities || []).map((e) => String(e).toLowerCase());
      const b = (items[j].entities || []).map((e) => String(e).toLowerCase());
      if (a.some((e) => b.includes(e))) {
        links.push({ source: items[i].id, target: items[j].id, kind: "entity" });
      }
    }
  }
  insights.forEach((ins) => {
    (ins.related_items || []).forEach((rid) => {
      if (items.find((it) => it.id === rid)) {
        links.push({ source: ins.id, target: rid, kind: "insight" });
      }
    });
  });

  return { nodes: [...newsNodes, ...insightNodes], links };
}
