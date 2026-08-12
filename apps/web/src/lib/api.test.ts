import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScanResult } from "@stalo/shared";
import {
  createIdea,
  createTopic,
  deleteIdea,
  deleteTopic,
  fetchIdeas,
  fetchLatestScan,
  fetchSettings,
  fetchTopics,
  requestScan,
  saveLens,
  type NewIdeaPayload,
} from "./api";
import { fakeLocalStorage } from "./testUtils";

function stubFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestScan — erros do servidor", () => {
  it("erro com corpo JSON usa a mensagem do servidor (ex.: 429 do limite)", async () => {
    stubFetch(429, { error: "Você usou seus 4 scans desta janela de 2 horas. Volte daqui a pouco." });
    const err = await requestScan(["IA"], null).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("4 scans");
  });

  it("erro sem mensagem cai no texto genérico", async () => {
    stubFetch(500, {});
    const err = await requestScan(["IA"], null).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("Falha ao buscar notícias.");
  });
});

describe("temas no armazenamento local", () => {
  beforeEach(() => vi.stubGlobal("localStorage", fakeLocalStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it("cria tema com id próprio e persiste", async () => {
    const t = await createTopic("IA");
    expect(t.name).toBe("IA");
    expect(t.id).toBeTruthy();
    expect(await fetchTopics()).toEqual([t]);
  });

  it("recusa o 6º tema com mensagem visível", async () => {
    for (const n of ["a", "b", "c", "d", "e"]) await createTopic(n);
    await expect(createTopic("f")).rejects.toThrow(/5 temas/);
  });

  it("recusa duplicado ignorando maiúsculas", async () => {
    await createTopic("Fintech");
    await expect(createTopic("fintech")).rejects.toThrow(/já/i);
  });

  it("remove tema por id", async () => {
    const t = await createTopic("IA");
    await deleteTopic(t.id);
    expect(await fetchTopics()).toEqual([]);
  });

  it("a lente vai e volta", async () => {
    expect(await fetchSettings()).toEqual({ lens: null });
    await saveLens("founder");
    expect(await fetchSettings()).toEqual({ lens: "founder" });
  });
});

function fakeIdeaPayload(overrides: Partial<NewIdeaPayload> = {}): NewIdeaPayload {
  return {
    insightRef: "i1",
    type: "oportunidade",
    title: "Título",
    description: "Descrição",
    rationale: "Rationale",
    whyNow: "Why now",
    soWhat: "So what",
    notes: "",
    relatedItems: [],
    ...overrides,
  };
}

describe("ideias salvas no armazenamento local", () => {
  beforeEach(() => vi.stubGlobal("localStorage", fakeLocalStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it("salvar devolve a ideia com id e savedAt preenchidos e deepDive/financials nulos", async () => {
    const idea = await createIdea(fakeIdeaPayload({ title: "Minha ideia" }));
    expect(idea.id).toBeTruthy();
    expect(idea.savedAt).toBeTruthy();
    expect(new Date(idea.savedAt).toString()).not.toBe("Invalid Date");
    expect(idea.deepDive).toBeNull();
    expect(idea.financials).toBeNull();
    expect(idea.title).toBe("Minha ideia");
  });

  it("listar devolve o que foi salvo", async () => {
    const idea = await createIdea(fakeIdeaPayload());
    expect(await fetchIdeas()).toEqual([idea]);
  });

  it("remover por id tira só aquela", async () => {
    const a = await createIdea(fakeIdeaPayload({ title: "A" }));
    const b = await createIdea(fakeIdeaPayload({ title: "B" }));
    await deleteIdea(a.id);
    const restantes = await fetchIdeas();
    expect(restantes).toHaveLength(1);
    expect(restantes[0].id).toBe(b.id);
  });

  it("a lista sai da mais recente para a mais antiga", async () => {
    const a = await createIdea(fakeIdeaPayload({ title: "A" }));
    const b = await createIdea(fakeIdeaPayload({ title: "B" }));
    const c = await createIdea(fakeIdeaPayload({ title: "C" }));
    expect((await fetchIdeas()).map((i) => i.id)).toEqual([c.id, b.id, a.id]);
  });
});

describe("scan — persistência ponta a ponta", () => {
  beforeEach(() => vi.stubGlobal("localStorage", fakeLocalStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it("requestScan grava o resultado, e fetchLatestScan devolve o que foi gravado", async () => {
    const result: ScanResult = { items: [], insights: [] };
    stubFetch(200, result);
    const returned = await requestScan(["IA"], null);
    expect(returned).toEqual(result);

    const stored = await fetchLatestScan();
    expect(stored.result).toEqual(result);
    expect(stored.createdAt).toBeTruthy();
  });
});
