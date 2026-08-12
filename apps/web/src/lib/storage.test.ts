import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasAnything, readIdeas, readLens, readTopics, writeIdeas, writeLens, writeTopics } from "./storage";

// A suíte roda em `environment: "node"` (vitest.config.ts) e o projeto não usa
// jsdom — então `localStorage` não existe aqui. Em vez de trocar o ambiente e
// pagar por jsdom só para testar um mapa com getItem/setItem, injetamos um
// falso, no mesmo estilo do stubFetch que api.test.ts já usa.
function fakeLocalStorage() {
  const mapa = new Map<string, string>();
  return {
    getItem: (k: string) => mapa.get(k) ?? null,
    setItem: (k: string, v: string) => void mapa.set(k, v),
    removeItem: (k: string) => void mapa.delete(k),
    clear: () => mapa.clear(),
  };
}

beforeEach(() => vi.stubGlobal("localStorage", fakeLocalStorage()));
afterEach(() => vi.unstubAllGlobals());

describe("storage", () => {
  it("round-trip de temas", () => {
    writeTopics([{ id: "1", name: "IA" }]);
    expect(readTopics()).toEqual([{ id: "1", name: "IA" }]);
  });

  it("chave ausente devolve o vazio, não quebra", () => {
    expect(readTopics()).toEqual([]);
    expect(readIdeas()).toEqual([]);
    expect(readLens()).toBeNull();
  });

  it("JSON inválido é descartado em vez de estourar", () => {
    localStorage.setItem("stalo:topics", "{isso não é json");
    expect(readTopics()).toEqual([]);
  });

  it("forma errada é descartada — o dado do devtools não chega à UI", () => {
    localStorage.setItem("stalo:topics", JSON.stringify({ v: 1, data: "haha" }));
    expect(readTopics()).toEqual([]);
    localStorage.setItem("stalo:topics", JSON.stringify({ v: 1, data: [{ id: 1, name: null }] }));
    expect(readTopics()).toEqual([]);
  });

  it("versão antiga é descartada, não migrada", () => {
    localStorage.setItem("stalo:topics", JSON.stringify({ v: 0, data: [{ id: "1", name: "IA" }] }));
    expect(readTopics()).toEqual([]);
  });

  it("lente só aceita os três valores conhecidos", () => {
    writeLens("investor");
    expect(readLens()).toBe("investor");
    localStorage.setItem("stalo:settings", JSON.stringify({ v: 1, data: { lens: "hacker" } }));
    expect(readLens()).toBeNull();
  });

  it("ideias corrompidas no meio da lista não derrubam as boas", () => {
    // uma entrada inválida não pode custar todas as ideias salvas do usuário
    const boa = {
      id: "a", insightRef: "i1", type: "oportunidade", title: "T", description: "D",
      rationale: "R", whyNow: "W", soWhat: "S", notes: "", savedAt: "2026-08-12",
      relatedItems: [], deepDive: null, financials: null,
    };
    localStorage.setItem("stalo:ideas", JSON.stringify({ v: 1, data: [boa, { id: 2 }] }));
    const lidas = readIdeas();
    expect(lidas).toHaveLength(1);
    expect(lidas[0].id).toBe("a");
  });

  it("hasAnything diz se o visitante já configurou algo", () => {
    expect(hasAnything()).toBe(false);
    writeTopics([{ id: "1", name: "IA" }]);
    expect(hasAnything()).toBe(true);
  });

  it("escrever não estoura quando o armazenamento recusa (cota cheia / modo privado)", () => {
    vi.stubGlobal("localStorage", {
      ...fakeLocalStorage(),
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });
    // perder a persistência é ruim; derrubar a tela do usuário é pior
    expect(() => writeIdeas([])).not.toThrow();
  });

  it("no servidor (sem localStorage) devolve o vazio em vez de estourar", () => {
    // as funções de leitura rodam em componentes que também renderizam no
    // servidor; lá o global não existe
    vi.unstubAllGlobals();
    expect(readTopics()).toEqual([]);
    expect(readLens()).toBeNull();
    expect(() => writeTopics([{ id: "1", name: "IA" }])).not.toThrow();
  });
});
