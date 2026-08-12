import { describe, expect, it } from "vitest";
import type { NewsItem, SavedIdea } from "@stalo/shared";
import {
  MAX_BODY_BYTES,
  MAX_RELATED_ITEMS,
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
    const result = validateIdeaPayload({ idea, lens: "founder" });
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.idea).toEqual(idea);
    expect(result.lens).toBe("founder");
  });

  it("corpo sem idea é recusado", () => {
    const result = validateIdeaPayload({ lens: "founder" });
    expect("error" in result).toBe(true);
    if (!("error" in result)) return;
    expect(result.error).toMatch(/ideia/i);
  });

  it("lens desconhecida vira null em vez de recusar", () => {
    const idea = fakeIdea();
    const result = validateIdeaPayload({ idea, lens: "astrologia" });
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.lens).toBeNull();
  });

  it("title acima do teto recusa com mensagem em português", () => {
    const idea = fakeIdea({ title: "a".repeat(MAX_TITLE + 1) });
    const result = validateIdeaPayload({ idea, lens: null });
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
    const result = validateIdeaPayload({ idea, lens: null });
    expect("error" in result).toBe(true);
    if (!("error" in result)) return;
    expect(result.error).toMatch(/notícias relacionadas/i);
    expect(result.error).toContain(String(MAX_RELATED_ITEMS));
  });

  it("corpo acima do teto de tamanho recusa", () => {
    const idea = fakeIdea({ notes: "x".repeat(MAX_BODY_BYTES + 1) });
    const result = validateIdeaPayload({ idea, lens: null });
    expect("error" in result).toBe(true);
    if (!("error" in result)) return;
    expect(result.error).toMatch(/32\s*KB|tamanho/i);
  });
});
