import { describe, expect, it } from "vitest";
import type { NewsItem, SavedIdea } from "@stalo/shared";
import {
  MAX_BODY_BYTES,
  MAX_RELATED_FIELD,
  MAX_RELATED_ITEMS,
  MAX_TEXT,
  MAX_TITLE,
  validateIdeaPayload,
} from "./aiPayload";

// A ideia agora chega pelo corpo da requisição (o servidor não tem mais banco
// para buscá-la). Isso abre um caminho novo para queimar tokens mandando algo
// gigante — este validador recusa (não trunca) forma inválida ou tamanho
// acima do teto, ANTES de montar o prompt.

function fakeNewsItem(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    id: "n1",
    topic: "IA",
    title: "Notícia",
    summary: "Resumo",
    source: "Fonte",
    url: "https://exemplo.com",
    entities: [],
    publishedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function fakeIdea(overrides: Partial<SavedIdea> = {}): SavedIdea {
  return {
    id: "idea-1",
    insightRef: "i1",
    type: "oportunidade",
    title: "Título",
    description: "Descrição",
    rationale: "Rationale",
    whyNow: "Why now",
    soWhat: "So what",
    notes: "",
    savedAt: "2026-08-01T00:00:00.000Z",
    relatedItems: [],
    deepDive: null,
    financials: null,
    ...overrides,
  };
}

describe("validateIdeaPayload", () => {
  it("corpo válido passa e devolve a ideia", () => {
    const idea = fakeIdea();
    const result = validateIdeaPayload({ idea });
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.idea).toEqual(idea);
  });

  it("corpo sem idea é recusado", () => {
    const result = validateIdeaPayload({ nada: true });
    expect("error" in result).toBe(true);
    if (!("error" in result)) return;
    expect(result.error).toMatch(/ideia/i);
  });

  // a lente saiu do produto, mas uma aba aberta antes do deploy continua
  // mandando `{ idea, lens }` — o campo a mais é ignorado, nunca recusado.
  it("campo desconhecido no corpo (ex.: a antiga lens) é ignorado", () => {
    const idea = fakeIdea();
    const result = validateIdeaPayload({ idea, lens: "founder" });
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.idea).toEqual(idea);
  });

  it("title acima do teto recusa com mensagem em português", () => {
    const idea = fakeIdea({ title: "a".repeat(MAX_TITLE + 1) });
    const result = validateIdeaPayload({ idea });
    expect("error" in result).toBe(true);
    if (!("error" in result)) return;
    expect(result.error).toMatch(/título/i);
    expect(result.error).toContain(String(MAX_TITLE));
  });

  it("relatedItems com um item a mais que o teto recusa", () => {
    const relatedItems = Array.from({ length: MAX_RELATED_ITEMS + 1 }, (_, i) =>
      fakeNewsItem({ id: `n${i}` }),
    );
    const idea = fakeIdea({ relatedItems });
    const result = validateIdeaPayload({ idea });
    expect("error" in result).toBe(true);
    if (!("error" in result)) return;
    expect(result.error).toMatch(/notícias relacionadas/i);
    expect(result.error).toContain(String(MAX_RELATED_ITEMS));
  });

  it("corpo acima do teto de tamanho recusa", () => {
    const idea = fakeIdea({ notes: "x".repeat(MAX_BODY_BYTES + 1) });
    const result = validateIdeaPayload({ idea });
    expect("error" in result).toBe(true);
    if (!("error" in result)) return;
    expect(result.error).toMatch(/32\s*KB|tamanho/i);
  });

  // Achado 1 da revisão: deepDive decide, na rota de financials, se a ideia
  // já foi mergulhada (`if (!idea.deepDive)` → 409). Sem checar a forma, um
  // corpo como `deepDive: true` passava por essa checagem como se fosse um
  // mergulho de verdade, e a IA era chamada para uma ideia nunca mergulhada.
  it("deepDive que não é objeto nem null é recusado", () => {
    const idea = { ...fakeIdea(), deepDive: true } as unknown as SavedIdea;
    const result = validateIdeaPayload({ idea });
    expect("error" in result).toBe(true);
    if (!("error" in result)) return;
    expect(result.error).toMatch(/ideia/i);
  });

  it("financials que não é objeto nem null é recusado", () => {
    const idea = { ...fakeIdea(), financials: "não" } as unknown as SavedIdea;
    const result = validateIdeaPayload({ idea });
    expect("error" in result).toBe(true);
    if (!("error" in result)) return;
    expect(result.error).toMatch(/ideia/i);
  });

  // Achado 3 da revisão: os campos de texto (description/rationale/whyNow/
  // soWhat/notes) e os campos de cada relatedItem que vão de fato para o
  // prompt (topic/title/summary/source/url) tinham teto de tipo mas nunca
  // eram exercitados por um teste.
  it("campo de texto acima do teto (MAX_TEXT) recusa", () => {
    const idea = fakeIdea({ description: "a".repeat(MAX_TEXT + 1) });
    const result = validateIdeaPayload({ idea });
    expect("error" in result).toBe(true);
    if (!("error" in result)) return;
    expect(result.error).toMatch(/descrição/i);
    expect(result.error).toContain(String(MAX_TEXT));
  });

  it("campo de relatedItem acima do teto (MAX_RELATED_FIELD) recusa", () => {
    const idea = fakeIdea({
      relatedItems: [fakeNewsItem({ summary: "s".repeat(MAX_RELATED_FIELD + 1) })],
    });
    const result = validateIdeaPayload({ idea });
    expect("error" in result).toBe(true);
    if (!("error" in result)) return;
    expect(result.error).toContain(String(MAX_RELATED_FIELD));
  });
});
