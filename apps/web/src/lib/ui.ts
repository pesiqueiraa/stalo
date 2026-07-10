import type { InsightType } from "@stalo/shared";

export function labelForType(type: InsightType): string {
  if (type === "tendencia") return "Tendência";
  if (type === "gap") return "Gap de mercado";
  return "Oportunidade";
}

// Founder é a única lente do produto: o brief lidera sempre com oportunidade
// (a taxonomia de insight continua universal — isto só decide o que sobe ao topo).
export const LEAD_CATEGORY: InsightType = "oportunidade";

// Identidade de conteúdo de um insight (tipo + título normalizado), usada pra
// detectar "já salva". O id do insight (i1, i2…) vem do LLM e REINICIA a cada
// scan, então não serve de chave estável entre scans.
export const insightKey = (type: string, title: string) =>
  `${type}::${title.trim().toLowerCase()}`;

// rótulo do futuro "deep dive", com concordância de gênero por tipo
export function deepDiveLabel(type: InsightType): string {
  if (type === "tendencia") return "Mergulhar nessa tendência";
  if (type === "gap") return "Mergulhar nesse gap";
  return "Mergulhar nessa oportunidade";
}

export function formatShortDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
