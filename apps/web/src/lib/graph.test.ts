import { describe, expect, it } from "vitest";
import type { InsightNode, NewsNode, ScanResult } from "@stalo/shared";
import { buildGraph, INSIGHT_COLORS, TOPIC_COLORS, topicColor } from "./graph";

const news = (id: string, topic: string, entities: string[] = []) => ({
  id,
  topic,
  title: `t-${id}`,
  summary: "",
  source: "",
  url: `https://x/${id}`,
  entities,
  publishedAt: "2026-06-01",
});

describe("topicColor", () => {
  const topics = ["A", "B", "C"];
  it("mapeia por índice do tema", () => {
    expect(topicColor("A", topics)).toBe(TOPIC_COLORS[0]);
    expect(topicColor("B", topics)).toBe(TOPIC_COLORS[1]);
  });
  it("cai na primeira cor para tema desconhecido", () => {
    expect(topicColor("Z", topics)).toBe(TOPIC_COLORS[0]);
  });
  it("faz wrap quando há mais temas que cores", () => {
    const many = Array.from({ length: TOPIC_COLORS.length + 1 }, (_, i) => `T${i}`);
    expect(topicColor(`T${TOPIC_COLORS.length}`, many)).toBe(TOPIC_COLORS[0]);
  });
});

describe("buildGraph", () => {
  const topics = ["IA", "Energia"];

  it("cria um nó por notícia e por insight, com cor/forma", () => {
    const scan: ScanResult = {
      items: [news("n1", "IA"), news("n2", "Energia")],
      insights: [
        {
          id: "i1",
          type: "gap",
          title: "Cross",
          description: "",
          rationale: "",
          whyNow: "",
          soWhat: "",
          related_items: ["n1", "n2"],
        },
      ],
    };
    const g = buildGraph(scan, topics);
    const newsNodes = g.nodes.filter((n): n is NewsNode => n.kind === "news");
    const insightNodes = g.nodes.filter((n): n is InsightNode => n.kind === "insight");
    expect(newsNodes).toHaveLength(2);
    expect(insightNodes).toHaveLength(1);
    expect(newsNodes[0].color).toBe(topicColor("IA", topics));
    expect(insightNodes[0].color).toBe(INSIGHT_COLORS.gap);
  });

  it("liga notícias que compartilham uma entidade (case-insensitive)", () => {
    const scan: ScanResult = {
      items: [news("n1", "IA", ["Chips"]), news("n2", "Energia", ["chips"]), news("n3", "IA", ["outra"])],
      insights: [],
    };
    const g = buildGraph(scan, topics);
    const entityLinks = g.links.filter((l) => l.kind === "entity");
    expect(entityLinks).toHaveLength(1);
    expect([entityLinks[0].source, entityLinks[0].target].sort()).toEqual(["n1", "n2"]);
  });

  it("liga insight só às notícias relacionadas que existem", () => {
    const scan: ScanResult = {
      items: [news("n1", "IA")],
      insights: [
        {
          id: "i1",
          type: "tendencia",
          title: "X",
          description: "",
          rationale: "",
          whyNow: "",
          soWhat: "",
          related_items: ["n1", "fantasma"],
        },
      ],
    };
    const g = buildGraph(scan, topics);
    const insightLinks = g.links.filter((l) => l.kind === "insight");
    expect(insightLinks).toHaveLength(1);
    expect(insightLinks[0].target).toBe("n1");
  });

  it("faz fallback do tipo inválido para oportunidade", () => {
    const scan = {
      items: [news("n1", "IA"), news("n2", "IA")],
      insights: [
        {
          id: "i1",
          type: "xpto",
          title: "X",
          description: "",
          rationale: "",
          whyNow: "",
          soWhat: "",
          related_items: ["n1", "n2"],
        },
      ],
    } as unknown as ScanResult;
    const g = buildGraph(scan, topics);
    const ins = g.nodes.find((n): n is InsightNode => n.kind === "insight")!;
    expect(ins.insightType).toBe("oportunidade");
  });
});
