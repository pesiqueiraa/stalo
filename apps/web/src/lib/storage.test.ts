import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readIdeas,
  readScan,
  readTopics,
  writeIdeas,
  writeScan,
  writeTopics,
} from "./storage";
import { fakeLocalStorage } from "./testUtils";

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

  it("ideia com campo de texto plausível-mas-errado é descartada", () => {
    // rationale/whyNow/soWhat vão para dentro de prompt de IA e para a tela —
    // um número ou objeto no devtools não pode passar disfarçado de texto
    const base = {
      id: "a", insightRef: "i1", type: "oportunidade", title: "T", description: "D",
      rationale: "R", whyNow: "W", soWhat: "S", notes: "", savedAt: "2026-08-12",
      relatedItems: [], deepDive: null, financials: null,
    };
    localStorage.setItem("stalo:ideas", JSON.stringify({ v: 1, data: [{ ...base, rationale: 123 }] }));
    expect(readIdeas()).toEqual([]);
    localStorage.setItem("stalo:ideas", JSON.stringify({ v: 1, data: [{ ...base, whyNow: { x: 1 } }] }));
    expect(readIdeas()).toEqual([]);
  });

  it("ideia com type fora do enum é descartada", () => {
    // type decide qual bloco de análise a UI renderiza (componentes
    // discriminados por esse valor) — fora do enum vira ideia inválida, não
    // tela quebrada em silêncio
    const base = {
      id: "a", insightRef: "i1", type: "hacker", title: "T", description: "D",
      rationale: "R", whyNow: "W", soWhat: "S", notes: "", savedAt: "2026-08-12",
      relatedItems: [], deepDive: null, financials: null,
    };
    localStorage.setItem("stalo:ideas", JSON.stringify({ v: 1, data: [base] }));
    expect(readIdeas()).toEqual([]);
  });

  it("relatedItems com lixo mantém a ideia, mas filtra os itens inválidos", () => {
    const noticiaValida = {
      id: "n1", topic: "IA", title: "T", summary: "S", source: "src",
      url: "https://x.com", entities: [], publishedAt: "2026-08-12",
    };
    const boa = {
      id: "a", insightRef: "i1", type: "oportunidade", title: "T", description: "D",
      rationale: "R", whyNow: "W", soWhat: "S", notes: "", savedAt: "2026-08-12",
      relatedItems: [noticiaValida, { foo: "lixo" }, "string solta"],
      deepDive: null, financials: null,
    };
    localStorage.setItem("stalo:ideas", JSON.stringify({ v: 1, data: [boa] }));
    const lidas = readIdeas();
    expect(lidas).toHaveLength(1);
    expect(lidas[0].relatedItems).toEqual([noticiaValida]);
  });

  it("round-trip de scan: volta igual, com createdAt em ISO preenchido pelo writeScan", () => {
    const noticia = {
      id: "n1", topic: "IA", title: "T", summary: "S", source: "src",
      url: "https://x.com", entities: [], publishedAt: "2026-08-12",
    };
    const insight = {
      id: "i1", type: "oportunidade" as const, title: "T", description: "D",
      rationale: "R", whyNow: "W", soWhat: "S", related_items: ["n1"],
    };
    writeScan({ items: [noticia], insights: [insight] });
    const lido = readScan();
    expect(lido.result).toEqual({ items: [noticia], insights: [insight] });
    expect(lido.createdAt).toBeTruthy();
    expect(new Date(lido.createdAt as string).toString()).not.toBe("Invalid Date");
  });

  it("scan sem nada guardado devolve result e createdAt nulos", () => {
    expect(readScan()).toEqual({ result: null, createdAt: null });
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
    expect(() => writeTopics([{ id: "1", name: "IA" }])).not.toThrow();
  });

  describe("localStorage cujo GETTER lança (ex.: SecurityError com cookies bloqueados)", () => {
    // `typeof localStorage === "undefined"` só protege contra a referência não
    // existir — não contra o acesso à propriedade lançar. Em Chrome/Firefox
    // com cookies de terceiros bloqueados, e em webviews restritos, é
    // exatamente isso que acontece: o getter da propriedade lança. Simulamos
    // isso definindo o getter direto no globalThis (em vez de vi.stubGlobal,
    // que só troca o valor, não o comportamento de acesso).
    beforeEach(() => {
      vi.unstubAllGlobals();
      Object.defineProperty(globalThis, "localStorage", {
        get() {
          throw new Error("SecurityError");
        },
        configurable: true,
      });
    });

    afterEach(() => {
      // restaura a propriedade original (sem isso o resto da suíte quebra)
      delete (globalThis as { localStorage?: unknown }).localStorage;
    });

    it("as leituras devolvem o vazio em vez de propagar a exceção", () => {
      expect(readTopics()).toEqual([]);
      expect(readIdeas()).toEqual([]);
    });

    it("writeTopics não lança", () => {
      expect(() => writeTopics([{ id: "1", name: "IA" }])).not.toThrow();
      expect(writeTopics([{ id: "1", name: "IA" }])).toBe(false);
    });
  });
});
