// Derivação de apresentação (não é mock): transforma um Verdict na ScanResult
// que o buildGraph() consome pra montar a "evidência" — mesmo espírito de
// lib/graph.ts. Vive fora do verdictMock porque não depende de dados de exemplo:
// serve qualquer veredito, venha ele do mock ou do backend.

import type { Insight, NewsItem, ScanResult, Verdict, VerdictSource } from "@stalo/shared";

// ---- veredito → evidência navegável ----------------------------------------
// O grafo deixa de ser o produto e vira a PROVA: cada fonte do veredito vira uma
// notícia (nó), e as afirmações-chave (o que mudou, o gap, a ameaça) viram
// insights ligados às suas fontes. Assim, "ver a evidência no grafo" mostra
// exatamente o que sustenta o veredito — e nenhum insight aparece sem fonte.
export function verdictToScan(v: Verdict): ScanResult {
  const items: NewsItem[] = [];
  const seen = new Map<string, string>(); // url -> id (evita nós duplicados)
  const sectorOf = (i: number) => v.sectors[i % Math.max(1, v.sectors.length)] ?? v.sectors[0] ?? "";

  // registra uma fonte como notícia e devolve o id do nó, com uma entidade
  // compartilhável (o veículo) pra o grafo cruzar notícias do mesmo tema.
  function addSource(src: VerdictSource, topic: string, entity: string): string {
    const existing = seen.get(src.url + src.diz);
    if (existing) return existing;
    const id = `n${items.length + 1}`;
    items.push({
      id,
      topic,
      title: src.diz,
      summary: "",
      source: src.veiculo,
      url: src.url,
      entities: [entity],
      publishedAt: src.data,
    });
    seen.set(src.url + src.diz, id);
    return id;
  }

  const insights: Insight[] = [];

  // (ii) o que mudou → uma tendência, ligada às notícias de timing
  const shiftIds = v.shifts.map((s, i) => addSource(s.fonte, sectorOf(0), `timing-${i}`));
  if (shiftIds.length > 0) {
    insights.push({
      id: "i1",
      type: "tendencia",
      title: "O que mudou nos últimos 90 dias",
      description: v.shifts[0]?.texto ?? "",
      rationale: v.shifts.map((s) => s.texto).join(" "),
      whyNow: v.shifts[0]?.texto ?? "",
      soWhat: v.pivot ?? v.callRationale,
      related_items: shiftIds,
    });
  }

  // (iii) o gap → o insight central, ligado às suas fontes
  const gapIds = v.gap.fontes.map((src, i) => addSource(src, sectorOf(1), `gap-${i}`));
  insights.push({
    id: "i2",
    type: "gap",
    title: "O gap específico",
    description: v.gap.texto,
    rationale: v.gap.texto,
    whyNow: v.shifts[0]?.texto ?? "",
    soWhat: v.pivot ?? "",
    related_items: gapIds,
  });

  // (i) quem já faz → cada player é uma notícia; a "oportunidade" (o ângulo)
  // liga o veredito a esses players e à ameaça
  const playerIds = v.players.map((p, i) => addSource(p.fonte, sectorOf(i), `player-${i}`));
  const threatId = addSource(v.threat.fonte, sectorOf(0), "ameaca");
  insights.push({
    id: "i3",
    type: "oportunidade",
    title: v.call === "pivot" ? "O ângulo (pivot sugerido)" : "O ângulo defensável",
    description: v.pivot ?? v.callRationale,
    rationale: v.callRationale,
    whyNow: v.shifts[0]?.texto ?? "",
    soWhat: v.pivot ?? v.callRationale,
    related_items: [...playerIds, threatId],
  });

  return { items, insights };
}
