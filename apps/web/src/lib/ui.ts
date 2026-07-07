import type { InsightType, Lens } from "@stalo/shared";

export function labelForType(type: InsightType): string {
  if (type === "tendencia") return "Tendência";
  if (type === "gap") return "Gap de mercado";
  return "Oportunidade";
}

// Categoria de insight que cada lente lidera no brief (ver arquiteturad §7). Não
// muda a taxonomia (universal) nem regenera texto — só decide o que sobe ao topo
// do memo por perfil. Fonte única desse mapa (consumida pelo Brief e pelo
// onboarding): founder → oportunidade, investidor → gap, explorador → tendência.
export const LENS_LEAD_CATEGORY: Record<Lens, InsightType> = {
  founder: "oportunidade",
  investor: "gap",
  explorer: "tendencia",
};

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
