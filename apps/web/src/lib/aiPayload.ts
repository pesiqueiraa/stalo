import type { InsightType, Lens, NewsItem, SavedIdea } from "@stalo/shared";

// Até a tarefa anterior, o conteúdo que ia para o prompt vinha do banco,
// escrito pelo próprio servidor. Agora a ideia vem no corpo da requisição,
// escrita por quem quiser (localStorage é entrada não confiável — ver
// apps/web/src/lib/storage.ts). Isso abre um caminho novo para queimar tokens
// mandando uma ideia gigante. Este módulo valida forma e impõe teto de
// tamanho ANTES de montar o prompt; uma recusa aqui é 400 e não consome cota
// de rate limit nem chama a OpenAI.
//
// Campos acima do teto são RECUSADOS, não truncados: truncar em silêncio
// mandaria para a IA algo diferente do que o usuário vê na tela.
export const MAX_BODY_BYTES = 32 * 1024;
export const MAX_TITLE = 200;
export const MAX_TEXT = 2000; // description, rationale, whyNow, soWhat, notes
export const MAX_RELATED_ITEMS = 20;
export const MAX_RELATED_FIELD = 500; // title e url de cada item de relatedItems

const INSIGHT_TYPES: InsightType[] = ["tendencia", "gap", "oportunidade"];
const LENSES: Lens[] = ["founder", "investor", "explorer"];

function isStr(v: unknown): v is string {
  return typeof v === "string";
}

// a lente é preferência de tom, não conteúdo de prompt de risco — uma lente
// desconhecida vira null (sem lente) em vez de recusar a requisição inteira.
function validLens(raw: unknown): Lens | null {
  return LENSES.includes(raw as Lens) ? (raw as Lens) : null;
}

function validateRelatedItems(raw: unknown): NewsItem[] | { error: string } {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    return { error: "'relatedItems' precisa ser uma lista." };
  }
  if (raw.length > MAX_RELATED_ITEMS) {
    return { error: `Envie no máximo ${MAX_RELATED_ITEMS} notícias relacionadas.` };
  }
  const items: NewsItem[] = [];
  for (const raw_item of raw) {
    const c = raw_item as NewsItem;
    if (
      typeof c !== "object" ||
      c === null ||
      !isStr(c.id) ||
      !isStr(c.topic) ||
      !isStr(c.title) ||
      !isStr(c.summary) ||
      !isStr(c.source) ||
      !isStr(c.url) ||
      !Array.isArray(c.entities) ||
      !isStr(c.publishedAt)
    ) {
      return { error: "Notícia relacionada em formato inválido." };
    }
    if (c.title.length > MAX_RELATED_FIELD || c.url.length > MAX_RELATED_FIELD) {
      return {
        error: `O título e a URL de cada notícia relacionada devem ter até ${MAX_RELATED_FIELD} caracteres.`,
      };
    }
    items.push(c);
  }
  return items;
}

// Valida o corpo de POST /api/dive e /api/financials: `{ idea, lens }`.
// Devolve a ideia (já com relatedItems normalizado) e a lente, ou uma
// mensagem de erro em português pronta para virar 400.
export function validateIdeaPayload(
  body: unknown,
): { idea: SavedIdea; lens: Lens | null } | { error: string } {
  // teto de tamanho total, antes de qualquer outra checagem — protege contra
  // um corpo gigante mesmo que a forma pareça válida
  const bodyBytes = new TextEncoder().encode(JSON.stringify(body ?? null)).length;
  if (bodyBytes > MAX_BODY_BYTES) {
    return { error: `O corpo da requisição excede o teto de ${MAX_BODY_BYTES / 1024} KB.` };
  }

  if (typeof body !== "object" || body === null) {
    return { error: "Envie a ideia no corpo da requisição." };
  }
  const box = body as { idea?: unknown; lens?: unknown };
  const raw = box.idea;
  if (typeof raw !== "object" || raw === null) {
    return { error: "Envie a ideia no corpo da requisição." };
  }
  const c = raw as SavedIdea;

  if (
    !isStr(c.id) ||
    !isStr(c.insightRef) ||
    !INSIGHT_TYPES.includes(c.type) ||
    !isStr(c.title) ||
    !isStr(c.description) ||
    !isStr(c.rationale) ||
    !isStr(c.whyNow) ||
    !isStr(c.soWhat) ||
    !isStr(c.notes) ||
    !isStr(c.savedAt)
  ) {
    return { error: "Ideia em formato inválido." };
  }

  if (c.title.length > MAX_TITLE) {
    return { error: `O título deve ter até ${MAX_TITLE} caracteres.` };
  }

  const textFields: { label: string; value: string }[] = [
    { label: "descrição", value: c.description },
    { label: "rationale", value: c.rationale },
    { label: "'por que agora'", value: c.whyNow },
    { label: "'e daí?'", value: c.soWhat },
    { label: "nota", value: c.notes },
  ];
  for (const field of textFields) {
    if (field.value.length > MAX_TEXT) {
      return { error: `O campo ${field.label} deve ter até ${MAX_TEXT} caracteres.` };
    }
  }

  const relatedItems = validateRelatedItems(c.relatedItems);
  if ("error" in relatedItems) return relatedItems;

  const lens = validLens(box.lens);

  const idea: SavedIdea = {
    ...c,
    relatedItems,
    deepDive: c.deepDive ?? null,
    financials: c.financials ?? null,
  };

  return { idea, lens };
}
