import { afterEach, describe, expect, it, vi } from "vitest";
import { requestScan } from "./api";

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
