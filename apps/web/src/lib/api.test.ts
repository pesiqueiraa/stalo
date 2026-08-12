import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTopic, deleteTopic, fetchSettings, fetchTopics, requestScan, saveLens } from "./api";
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
