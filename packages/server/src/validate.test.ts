import { describe, expect, it } from "vitest";
import type { Insight, NewsItem, VerdictSource } from "@stalo/shared";
import {
  isValidScanResult,
  MAX_INSIGHTS,
  MAX_ITEMS,
  MAX_VERDICT_GAP_SOURCES,
  MAX_VERDICT_PLAYERS,
  MAX_VERDICT_SHIFTS,
  type RawVerdict,
  stripCitations,
  stripNul,
  validateAndClean,
  validateVerdict,
} from "./validate";

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

describe("stripCitations", () => {
  it("remove a citação markdown entre parênteses que o modelo cola na prosa", () => {
    const s =
      "antes de cada release. ([docs.aws.amazon.com](https://docs.aws.amazon.com/sagemaker/latest/dg/governance.html?utm_source=openai))";
    expect(stripCitations(s)).toBe("antes de cada release.");
  });

  it("remove múltiplas citações no meio do texto", () => {
    const s =
      "A tese ganha ([c2pa.org](https://c2pa.org/about/)) mas há risco ([anthropic.com](https://www.anthropic.com/policy)).";
    expect(stripCitations(s)).toBe("A tese ganha mas há risco.");
  });

  it("converte link markdown solto em só o rótulo", () => {
    expect(stripCitations("veja [a fonte](https://x.com) aqui")).toBe("veja a fonte aqui");
  });

  it("não mexe em parênteses comuns (sem link)", () => {
    expect(stripCitations("mapear quem constrói (inclusive stealth) hoje")).toBe(
      "mapear quem constrói (inclusive stealth) hoje",
    );
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

function src(over: Partial<VerdictSource> = {}): VerdictSource {
  return { veiculo: "V", diz: "d", url: "https://x/1", data: "2026-06-01", ...over };
}
function rawVerdict(over: Partial<RawVerdict> = {}): RawVerdict {
  return {
    players: [],
    shifts: [],
    gap: { texto: "há um vão específico", fontes: [] },
    threat: { texto: "", fonte: src({ url: "" }) },
    call: "pivot",
    callRationale: "porque a evidência aponta pra isso",
    pivot: "entre pela camada de dados",
    ...over,
  };
}
const THESIS = { build: "crédito de giro", forWhom: "produtor de café" };

describe("validateVerdict", () => {
  it("deduplica fontes por url, mantendo a primeira (duplicata não conta como descarte)", () => {
    const v = validateVerdict(THESIS, [], rawVerdict({
      players: [
        { nome: "A", oQueFaz: "x", relacao: "direto", fonte: src({ url: "https://dup" }) },
        { nome: "B", oQueFaz: "y", relacao: "adjacente", fonte: src({ url: "https://dup" }) },
      ],
    }));
    expect(v.players).toHaveLength(1);
    expect(v.players[0].nome).toBe("A");
    expect(v.discardedNoSource).toBe(0);
  });

  it("descarta afirmação com url vazia (conexão sem fonte não aparece)", () => {
    const v = validateVerdict(THESIS, [], rawVerdict({
      players: [
        { nome: "A", oQueFaz: "x", relacao: "direto", fonte: src({ url: "" }) },
        { nome: "B", oQueFaz: "y", relacao: "direto", fonte: src({ url: "https://b" }) },
      ],
    }));
    expect(v.players).toHaveLength(1);
    expect(v.players[0].nome).toBe("B");
  });

  it("conta em discardedNoSource exatamente as afirmações sem fonte", () => {
    const v = validateVerdict(THESIS, [], rawVerdict({
      players: [
        { nome: "A", oQueFaz: "x", relacao: "direto", fonte: src({ url: "" }) },
        { nome: "B", oQueFaz: "y", relacao: "direto", fonte: src({ url: "https://b" }) },
      ],
      shifts: [{ texto: "algo mudou", fonte: src({ url: "" }) }],
      gap: { texto: "o vão", fontes: [src({ url: "" }), src({ url: "https://g" })] },
      threat: { texto: "uma ameaça real", fonte: src({ url: "" }) },
    }));
    // 1 player + 1 shift + 1 gap-fonte + 1 threat, todos sem fonte = 4
    expect(v.discardedNoSource).toBe(4);
    // e os COM fonte sobrevivem
    expect(v.players).toHaveLength(1);
    expect(v.shifts).toHaveLength(0); // o único shift não tinha fonte
    expect(v.gap.fontes).toHaveLength(1);
    expect(v.threat.texto).toBe(""); // ameaça sem fonte some
  });

  it("aplica os limites por seção", () => {
    const players = Array.from({ length: 10 }, (_, i) => ({
      nome: `P${i}`,
      oQueFaz: "x",
      relacao: "direto" as const,
      fonte: src({ url: `https://p${i}` }),
    }));
    const shifts = Array.from({ length: 10 }, (_, i) => ({
      texto: `S${i}`,
      fonte: src({ url: `https://s${i}` }),
    }));
    const fontes = Array.from({ length: 10 }, (_, i) => src({ url: `https://g${i}` }));
    const v = validateVerdict(THESIS, [], rawVerdict({ players, shifts, gap: { texto: "o vão", fontes } }));
    expect(v.players).toHaveLength(MAX_VERDICT_PLAYERS);
    expect(v.shifts).toHaveLength(MAX_VERDICT_SHIFTS);
    expect(v.gap.fontes).toHaveLength(MAX_VERDICT_GAP_SOURCES);
  });

  it("zera o pivot quando a decisão não é 'pivot'", () => {
    const v = validateVerdict(THESIS, [], rawVerdict({ call: "go", pivot: "algo" }));
    expect(v.pivot).toBeNull();
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
