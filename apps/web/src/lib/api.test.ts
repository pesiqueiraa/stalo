import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScanResult } from "@stalo/shared";
import type { DeepDive, Financials, SavedIdea } from "@stalo/shared";
import {
  createIdea,
  createTopic,
  deleteIdea,
  deleteTopic,
  fetchIdeas,
  fetchLatestScan,
  fetchSettings,
  fetchTopics,
  requestDeepDive,
  requestFinancials,
  requestScan,
  saveLens,
  type NewIdeaPayload,
} from "./api";
import { fakeLocalStorage } from "./testUtils";
import { readIdeas, writeIdeas } from "./storage";

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

  it("cota cheia ao remover: rejeita com mensagem visível", async () => {
    vi.stubGlobal("localStorage", {
      ...fakeLocalStorage(),
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });
    await expect(deleteTopic("qualquer-id")).rejects.toThrow(
      "Não consegui remover o tema — armazenamento do navegador indisponível.",
    );
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

  it("cota cheia ao remover: rejeita com mensagem visível", async () => {
    vi.stubGlobal("localStorage", {
      ...fakeLocalStorage(),
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });
    await expect(deleteIdea("qualquer-id")).rejects.toThrow(
      "Não consegui remover a ideia — armazenamento do navegador indisponível.",
    );
  });

  it("cota cheia: rejeita com mensagem visível, sem derrubar a tela", async () => {
    // o card aparecia no state do React mesmo sem persistir — o usuário só
    // descobria que a ideia sumiu depois de recarregar. write() agora devolve
    // false, e createIdea propaga isso como erro (a UI já trata erro dessas
    // funções e mostra a mensagem).
    vi.stubGlobal("localStorage", {
      ...fakeLocalStorage(),
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });
    await expect(createIdea(fakeIdeaPayload())).rejects.toThrow(
      "Não consegui salvar a ideia — armazenamento do navegador indisponível.",
    );
  });
});

describe("scan — persistência ponta a ponta", () => {
  beforeEach(() => vi.stubGlobal("localStorage", fakeLocalStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it("requestScan grava o resultado, e fetchLatestScan devolve o que foi gravado", async () => {
    const result: ScanResult = { items: [], insights: [] };
    stubFetch(200, result);
    const returned = await requestScan(["IA"], null);
    expect(returned).toEqual({ result, persisted: true });

    const stored = await fetchLatestScan();
    expect(stored.result).toEqual(result);
    expect(stored.createdAt).toBeTruthy();
  });

  // Decisão de projeto: o scan já custou a chamada de IA quando chega aqui —
  // se o navegador recusar guardar (cota cheia, modo privado), a função NÃO
  // pode lançar e descartar um resultado que já saiu caro. Ela resolve com
  // persisted: false, e quem chama decide como avisar sem perder o resultado
  // na tela. Se alguém trocar isso por um throw, este teste quebra.
  it("requestScan resolve (não rejeita) com persisted: false quando o navegador recusa guardar", async () => {
    const result: ScanResult = { items: [], insights: [] };
    stubFetch(200, result);
    vi.stubGlobal("localStorage", {
      ...fakeLocalStorage(),
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });
    const returned = await requestScan(["IA"], null);
    expect(returned).toEqual({ result, persisted: false });
  });
});

function fakeSavedIdea(overrides: Partial<SavedIdea> = {}): SavedIdea {
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

describe("requestDeepDive/requestFinancials — cache no cliente, sem gastar a IA à toa", () => {
  beforeEach(() => vi.stubGlobal("localStorage", fakeLocalStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it("mergulho já feito (com análise por tipo): nem faz a requisição", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const idea = fakeSavedIdea({
      deepDive: { typeAnalysis: { kind: "oportunidade", beachhead: "b", menorTeste: "t" } } as DeepDive,
    });
    const returned = await requestDeepDive(idea);
    expect(returned).toBe(idea);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sem mergulho: chama /api/dive e persiste a ideia atualizada", async () => {
    const deepDive = { typeAnalysis: null, market: null, proximosPassos: [], sinais: [] } as DeepDive;
    stubFetch(200, deepDive);
    writeIdeas([fakeSavedIdea()]);
    const returned = await requestDeepDive(fakeSavedIdea());
    expect(returned.deepDive).toEqual(deepDive);
    const [stored] = readIdeas();
    expect(stored.deepDive).toEqual(deepDive);
  });

  it("financeiro já analisado: nem faz a requisição", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const idea = fakeSavedIdea({
      deepDive: { typeAnalysis: null, market: null, proximosPassos: [], sinais: [] } as DeepDive,
      financials: { mercado: "m", monetizacao: "mo", premissas: [], custoValidar: "c" } as Financials,
    });
    const returned = await requestFinancials(idea);
    expect(returned).toBe(idea);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sem mergulho ainda: recusa no cliente com a mensagem exata, sem requisição", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const idea = fakeSavedIdea({ deepDive: null });
    await expect(requestFinancials(idea)).rejects.toThrow(
      "Mergulhe na ideia antes de aprofundar no financeiro.",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("mergulhada e sem financeiro: chama /api/financials e persiste a ideia atualizada", async () => {
    const financials = { mercado: "grande", monetizacao: "assinatura", premissas: [], custoValidar: "baixo" } as Financials;
    stubFetch(200, financials);
    const idea = fakeSavedIdea({
      deepDive: { typeAnalysis: null, market: null, proximosPassos: [], sinais: [] } as DeepDive,
    });
    writeIdeas([idea]);
    const returned = await requestFinancials(idea);
    expect(returned.financials).toEqual(financials);
    const [stored] = readIdeas();
    expect(stored.financials).toEqual(financials);
  });
});
