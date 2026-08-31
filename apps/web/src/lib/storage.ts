import type { Insight, InsightType, NewsItem, SavedIdea, ScanResult, Topic } from "@stalo/shared";

// Única parte do app que toca localStorage. Os dados do visitante vivem aqui
// desde 2026-08 — não há banco, não há conta, não há sincronização entre
// aparelhos (ver artefatos/specs/2026-08-11-sem-banco-design.md).
//
// REGRA: o conteúdo do localStorage é ENTRADA NÃO CONFIÁVEL. Qualquer pessoa
// edita pelo devtools, e daqui esse conteúdo vai para a UI e para dentro de
// prompts. Tudo que sai é validado; o que não bater é descartado.

const VERSION = 1;

const KEYS = {
  topics: "stalo:topics",
  scan: "stalo:scan",
  ideas: "stalo:ideas",
} as const;

// Guard de ambiente: no servidor (e no vitest, que roda em `node`) o global
// não existe. Checamos o `localStorage` direto, e não o `window`, para o teste
// poder injetar um falso sem precisar simular um DOM inteiro.
//
// O try/catch importa tanto quanto o `typeof`: em navegadores com cookies
// bloqueados (e em alguns webviews restritos) o próprio ACESSO à propriedade
// `localStorage` lança `SecurityError` — `typeof` só protege contra a
// referência não existir, não contra um getter que lança. Sem isso, qualquer
// leitura (ex.: `hasAnything()` no efeito do radar) derrubava a página inteira.
function loja(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function read<T>(key: string, validate: (raw: unknown) => T | null): T | null {
  const ls = loja();
  if (!ls) return null;
  let parsed: unknown;
  try {
    const raw = ls.getItem(key);
    if (!raw) return null;
    parsed = JSON.parse(raw);
  } catch {
    return null; // JSON quebrado: trata como ausente
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const box = parsed as { v?: unknown; data?: unknown };
  if (box.v !== VERSION) return null; // versão antiga: descarta, não migra
  return validate(box.data);
}

// Devolve true quando persistiu de verdade. `false` (cota cheia, modo privado,
// getter que lança) não derruba a tela — quem chama decide o que fazer com a
// falha (ver funções de escrita abaixo e apps/web/src/lib/api.ts).
function write(key: string, data: unknown): boolean {
  const ls = loja();
  if (!ls) return false;
  try {
    ls.setItem(key, JSON.stringify({ v: VERSION, data }));
    return true;
  } catch {
    return false;
  }
}

function isStr(v: unknown): v is string {
  return typeof v === "string";
}

// ---------- temas ----------

function validTopics(raw: unknown): Topic[] | null {
  if (!Array.isArray(raw)) return null;
  const ok = raw.filter((t): t is Topic => {
    const c = t as Topic;
    return !!c && isStr(c.id) && isStr(c.name);
  });
  return ok;
}

export function readTopics(): Topic[] {
  return read(KEYS.topics, validTopics) ?? [];
}

export function writeTopics(topics: Topic[]): boolean {
  return write(KEYS.topics, topics);
}

// ---------- scan ----------

function isNewsItem(v: unknown): v is NewsItem {
  const c = v as NewsItem;
  return !!c && isStr(c.id);
}

function isInsight(v: unknown): v is Insight {
  const c = v as Insight;
  return !!c && isStr(c.id);
}

function validScan(raw: unknown): { result: ScanResult; createdAt: string } | null {
  if (typeof raw !== "object" || raw === null) return null;
  const box = raw as { result?: unknown; createdAt?: unknown };
  if (!isStr(box.createdAt)) return null;
  const result = box.result as { items?: unknown; insights?: unknown } | undefined;
  if (typeof result !== "object" || result === null) return null;
  if (!Array.isArray(result.items) || !Array.isArray(result.insights)) return null;
  const items = result.items.filter(isNewsItem);
  const insights = result.insights.filter(isInsight);
  return { result: { items, insights }, createdAt: box.createdAt };
}

export function readScan(): { result: ScanResult | null; createdAt: string | null } {
  const found = read(KEYS.scan, validScan);
  return found ? { result: found.result, createdAt: found.createdAt } : { result: null, createdAt: null };
}

export function writeScan(result: ScanResult): boolean {
  // o carimbo de tempo é responsabilidade de quem guarda — era o
  // `DEFAULT now()` da tabela `scans`.
  return write(KEYS.scan, { result, createdAt: new Date().toISOString() });
}

// ---------- ideias ----------

const INSIGHT_TYPES: InsightType[] = ["tendencia", "gap", "oportunidade"];

function validIdea(raw: unknown): SavedIdea | null {
  if (typeof raw !== "object" || raw === null) return null;
  const c = raw as SavedIdea;
  // `rationale`/`whyNow`/`soWhat` vão para dentro de prompt de IA nas tarefas
  // seguintes, além de aparecerem na tela — não sobram sem validar, como o
  // resto do módulo. `type` decide qual bloco a UI renderiza (componentes
  // discriminados por esse valor): fora do enum vira ideia inválida, não tela
  // quebrada em silêncio.
  if (
    !isStr(c.id) ||
    !isStr(c.title) ||
    !isStr(c.description) ||
    !INSIGHT_TYPES.includes(c.type) ||
    !isStr(c.insightRef) ||
    !isStr(c.rationale) ||
    !isStr(c.whyNow) ||
    !isStr(c.soWhat) ||
    !isStr(c.notes) ||
    !isStr(c.savedAt)
  ) {
    return null;
  }
  return {
    ...c,
    relatedItems: Array.isArray(c.relatedItems) ? c.relatedItems.filter(isNewsItem) : [],
    deepDive: c.deepDive ?? null,
    financials: c.financials ?? null,
  };
}

function validIdeas(raw: unknown): SavedIdea[] | null {
  if (!Array.isArray(raw)) return null;
  const ok: SavedIdea[] = [];
  for (const item of raw) {
    const valid = validIdea(item);
    if (valid) ok.push(valid);
  }
  return ok;
}

export function readIdeas(): SavedIdea[] {
  return read(KEYS.ideas, validIdeas) ?? [];
}

export function writeIdeas(ideas: SavedIdea[]): boolean {
  return write(KEYS.ideas, ideas);
}
