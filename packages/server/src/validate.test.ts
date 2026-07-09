import { describe, expect, it } from "vitest";
import type { Insight, NewsItem } from "@stalo/shared";
import { isValidScanResult, MAX_INSIGHTS, MAX_ITEMS, stripNul, validateAndClean } from "./validate";

function item(over: Partial<NewsItem> & { id: string }): NewsItem {
  return {
    topic: "IA",
    title: `t-${over.id}`,
    summary: "",
    source: "",
    url: `https://x/${over.id}`,
    entities: [],
    publishedAt: "2026-06-01",
    ...over,
  };
}
function insight(over: Partial<Insight> & { id: string; related_items: string[] }): Insight {
  return {
    type: "gap",
    title: `i-${over.id}`,
    description: "",
    rationale: "",
    whyNow: "",
    soWhat: "",
    ...over,
  };
}

describe("stripNul", () => {
  it("remove bytes nulos que o Postgres rejeita", () => {
    expect(stripNul(`a${String.fromCharCode(0)}b`)).toBe("ab");
    expect(stripNul("sem nulo")).toBe("sem nulo");
  });
});

describe("validateAndClean — notícias", () => {
  it("deduplica por url, mantendo a primeira", () => {
    const items = [
      item({ id: "n1", url: "https://dup", title: "A" }),
      item({ id: "n2", url: "https://dup", title: "B" }),
    ];
    const r = validateAndClean(items, []);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].id).toBe("n1");
  });

  it("deduplica por título case-insensitive", () => {
    const items = [
      item({ id: "n1", url: "https://a", title: "Mesma Notícia" }),
      item({ id: "n2", url: "https://b", title: "mesma notícia" }),
    ];
    expect(validateAndClean(items, []).items).toHaveLength(1);
  });

  it("aplica o teto de MAX_ITEMS", () => {
    const items = Array.from({ length: MAX_ITEMS + 5 }, (_, i) => item({ id: `n${i}` }));
    expect(validateAndClean(items, []).items).toHaveLength(MAX_ITEMS);
  });

  it("sanitiza bytes nulos nos campos", () => {
    const nul = String.fromCharCode(0);
    const items = [item({ id: "n1", title: `Ti${nul}tle`, summary: `su${nul}m` })];
    const r = validateAndClean(items, []);
    expect(r.items[0].title).toBe("Title");
    expect(r.items[0].summary).toBe("sum");
  });
});

describe("validateAndClean — insights", () => {
  const items = [item({ id: "n1" }), item({ id: "n2" }), item({ id: "n3" })];

  it("descarta insight com menos de 2 notícias relacionadas sobreviventes", () => {
    const insights = [insight({ id: "i1", related_items: ["n1"] })];
    expect(validateAndClean(items, insights).insights).toHaveLength(0);
  });

  it("filtra related_items órfãos e descarta se sobrar menos de 2", () => {
    const insights = [insight({ id: "i1", related_items: ["n1", "inexistente"] })];
    expect(validateAndClean(items, insights).insights).toHaveLength(0);
  });

  it("mantém insight válido, só com os related sobreviventes", () => {
    const insights = [insight({ id: "i1", related_items: ["n1", "n2", "fantasma"] })];
    const r = validateAndClean(items, insights);
    expect(r.insights).toHaveLength(1);
    expect(r.insights[0].related_items).toEqual(["n1", "n2"]);
  });

  it("descarta insight sem título", () => {
    const insights = [insight({ id: "i1", title: "  ", related_items: ["n1", "n2"] })];
    expect(validateAndClean(items, insights).insights).toHaveLength(0);
  });

  it("aplica o teto de MAX_INSIGHTS", () => {
    const insights = Array.from({ length: MAX_INSIGHTS + 3 }, (_, i) =>
      insight({ id: `i${i}`, title: `T${i}`, related_items: ["n1", "n2"] }),
    );
    expect(validateAndClean(items, insights).insights).toHaveLength(MAX_INSIGHTS);
  });
});

describe("isValidScanResult", () => {
  it("aceita objeto com arrays items/insights", () => {
    expect(isValidScanResult({ items: [], insights: [] })).toBe(true);
  });
  it("rejeita formatos inválidos", () => {
    expect(isValidScanResult(null)).toBe(false);
    expect(isValidScanResult({ items: [] })).toBe(false);
    expect(isValidScanResult({ items: "x", insights: [] })).toBe(false);
  });
});
