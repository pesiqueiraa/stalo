// SERVER-ONLY. Engine da edição semanal da newsletter: fia a INGESTÃO de RSS
// (rss.ts) ao ANALISTA do scan (analyze) e persiste o resultado por combo na
// edição da semana. Reusa o Analista existente — nenhum prompt novo (regra 4).
// A chave de IA só roda quando o combo não está em cache (regra 1: só no server).

import "server-only";
import type {
  AssembledEdition,
  NewsletterCombo,
  NewsletterSection,
} from "@stalo/shared";
import { ingestSectors } from "./rss";
import { analyze } from "./scan";
import { validateAndClean } from "./validate";
import { ensureEdition, getEdition, saveCombo } from "./repo";
import type { Origem } from "./feeds";

const ORIGENS: Origem[] = ["BR", "GRINGA"];

// segunda-feira da semana de `d`, em UTC, no formato YYYY-MM-DD. Identifica a
// edição (semana ISO, de segunda a domingo).
export function weekStart(d = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const diff = (date.getUTCDay() + 6) % 7; // dias desde a segunda (0=dom..6=sáb)
  date.setUTCDate(date.getUTCDate() - diff);
  return date.toISOString().slice(0, 10);
}

// chave estável de um conjunto de setores (ordena pra a ordem de escolha não
// gerar combos diferentes). A chave completa do cache é `${comboKey}|${origem}`.
export function comboKey(sectors: string[]): string {
  return [...sectors].sort().join("+");
}

// cruza um conjunto de setores numa origem: ingestão RSS → Analista → limpeza.
// Usa os `items` da ingestão (têm imageUrl) e só os `insights` do validateAndClean
// (que reconstrói NewsItem e perde imageUrl — por isso NÃO usamos cleaned.items).
async function crossCombo(
  sectors: string[],
  origem: Origem,
  days: number,
): Promise<NewsletterCombo> {
  const items = await ingestSectors(sectors, origem, days);
  if (items.length === 0) return { items: [], insights: [] };

  const rawInsights = await analyze(items);
  const cleaned = validateAndClean(items, rawInsights);
  return { items, insights: cleaned.insights.slice(0, 3) };
}

// monta a edição da semana para um conjunto de setores. Cada combo (setores ×
// origem) roda o LLM UMA vez: se já está no cache da edição, reusa; senão gera e
// persiste. As duas origens rodam EM SEQUÊNCIA pra não correr no UPDATE do JSONB.
export async function assemble(sectors: string[], days = 7): Promise<AssembledEdition> {
  const week = weekStart();
  await ensureEdition(week);
  const edition = await getEdition(week);
  const combos = edition?.combos ?? {};

  const sections: NewsletterSection[] = [];
  for (const origem of ORIGENS) {
    const key = `${comboKey(sectors)}|${origem}`;
    let combo = combos[key];
    if (!combo) {
      combo = await crossCombo(sectors, origem, days);
      await saveCombo(week, key, combo);
    }
    sections.push({ origem, items: combo.items, insights: combo.insights });
  }

  return { weekStart: week, sectors, sections };
}
