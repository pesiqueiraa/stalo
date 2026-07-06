import type { InsightType } from "@stalo/shared";

export function labelForType(type: InsightType): string {
  if (type === "tendencia") return "Tendência";
  if (type === "gap") return "Gap de mercado";
  return "Oportunidade";
}

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
