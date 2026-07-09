import type { Insight, NewsItem, ScanResult } from "@stalo/shared";

// Validação/limpeza do ScanResult — lógica PURA (sem IA, sem rede), separada de
// scan.ts pra ser testável sem instanciar o cliente OpenAI. Blinda a saída do
// LLM antes de virar grafo: dedup, limites e descarte de insights órfãos.

// Byte nulo (0x00): o Postgres rejeita esse caractere em colunas de texto e a
// saída do LLM/busca web às vezes o traz — removido antes de gravar.
const NUL = String.fromCharCode(0);

export const MAX_ITEMS = 15;
export const MAX_INSIGHTS = 5;

export const stripNul = (s: string): string =>
  typeof s === "string" ? s.split(NUL).join("") : s;

// Remove citações em markdown que o modelo (gpt-5.4-mini + web_search) cola na
// prosa — ex.: "release. ([docs.aws.amazon.com](https://...))". Como a UI mostra
// texto puro, elas apareceriam cruas. As fontes têm lugar próprio (players[].url).
export function stripCitations(s: string): string {
  if (typeof s !== "string") return s;
  return s
    .replace(/\s*\(\[[^\]]*\]\([^)]*\)\)/g, "") // ([rótulo](url)) — o padrão emitido
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // [rótulo](url) solto → só o rótulo
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function validateAndClean(items: NewsItem[], insights: Insight[]): ScanResult {
  // dedup de notícias por url e por título (case-insensitive); mantém a 1ª.
  // as strings já saem sanitizadas (sem byte nulo) daqui.
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const cleanItems: NewsItem[] = [];
  for (const raw of items) {
    const it: NewsItem = {
      id: raw.id,
      topic: stripNul(raw.topic),
      title: stripNul(raw.title),
      summary: stripNul(raw.summary),
      source: stripNul(raw.source),
      url: stripNul(raw.url),
      entities: (raw.entities ?? []).map(stripNul),
      publishedAt: stripNul(raw.publishedAt),
    };
    const url = it.url.trim();
    const titleKey = it.title.trim().toLowerCase();
    if (url && seenUrls.has(url)) continue;
    if (titleKey && seenTitles.has(titleKey)) continue;
    if (url) seenUrls.add(url);
    if (titleKey) seenTitles.add(titleKey);
    cleanItems.push(it);
    if (cleanItems.length >= MAX_ITEMS) break;
  }

  const itemIds = new Set(cleanItems.map((i) => i.id));
  const cleanInsights: Insight[] = [];
  for (const ins of insights) {
    // só ids de notícias que sobreviveram; o cruzamento exige >= 2 (regra do produto)
    const related = (ins.related_items ?? []).filter((id) => itemIds.has(id));
    if (related.length < 2) continue;
    const title = stripNul(ins.title).trim();
    if (!title) continue;
    cleanInsights.push({
      ...ins,
      title,
      description: stripNul(ins.description),
      rationale: stripNul(ins.rationale ?? ""),
      whyNow: stripNul(ins.whyNow ?? ""),
      soWhat: stripNul(ins.soWhat ?? ""),
      related_items: related,
    });
    if (cleanInsights.length >= MAX_INSIGHTS) break;
  }

  return { items: cleanItems, insights: cleanInsights };
}

export function isValidScanResult(value: unknown): value is ScanResult {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.items) && Array.isArray(v.insights);
}
