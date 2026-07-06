import type { InsightType } from "@stalo/shared";

// Formas dos nós de insight, compartilhadas entre o grafo (GraphCanvas) e a
// legenda (TopicsPanel) para não divergirem. Cada tipo tem um glifo próprio
// dentro de um losango vazado — ver INSIGHT_COLORS em lib/graph.ts.

// losango centrado na origem, com vértices a distância `r` do centro.
export function diamondPath(r: number): string {
  return `M0,${-r} L${r},0 L0,${r} L${-r},0 Z`;
}

// triângulo equilátero centrado na origem, circunscrito a um círculo de raio `r`
// (vértice de topo apontando pra cima). Centroide na origem.
export function trianglePath(r: number): string {
  const pt = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
  };
  return `M${pt(-90)} L${pt(30)} L${pt(150)} Z`;
}

// estrela de `points` pontas centrada na origem, alternando raio externo/interno,
// com a primeira ponta pra cima.
export function starPath(outer: number, inner: number, points = 5): string {
  let d = "";
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = ((-90 + (i * 180) / points) * Math.PI) / 180;
    d += `${i === 0 ? "M" : "L"}${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
  }
  return `${d}Z`;
}

// glifo central de cada tipo de insight, desenhado dentro do losango vazado.
export function innerGlyphPath(type: InsightType, r: number): string {
  if (type === "gap") return diamondPath(r * 0.22);
  if (type === "tendencia") return trianglePath(r * 0.26);
  return starPath(r * 0.29, r * 0.125); // oportunidade
}
