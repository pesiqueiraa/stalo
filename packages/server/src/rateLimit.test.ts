import { describe, expect, it } from "vitest";
import { checkRateLimit, type RateLimitStore } from "./rateLimit";

// store falso em memória: mesma semântica do Redis para INCR/EXPIRE/TTL,
// sem rede. `calls` registra as chamadas para verificar que o EXPIRE só
// acontece na primeira requisição da janela.
function fakeStore(): RateLimitStore & { calls: string[] } {
  const counts = new Map<string, number>();
  const ttls = new Map<string, number>();
  const calls: string[] = [];
  return {
    calls,
    async incr(key) {
      calls.push(`incr:${key}`);
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return n;
    },
    async expire(key, seconds) {
      calls.push(`expire:${key}:${seconds}`);
      ttls.set(key, seconds);
      return 1;
    },
    async ttl(key) {
      calls.push(`ttl:${key}`);
      return ttls.get(key) ?? -1;
    },
  };
}

describe("checkRateLimit", () => {
  it("permite a primeira requisição e desconta do saldo", async () => {
    const store = fakeStore();
    const r = await checkRateLimit("scan:1.1.1.1", 4, 7200, store);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(3);
  });

  it("define o TTL só na primeira requisição da janela", async () => {
    const store = fakeStore();
    await checkRateLimit("scan:1.1.1.1", 4, 7200, store);
    await checkRateLimit("scan:1.1.1.1", 4, 7200, store);
    const expires = store.calls.filter((c) => c.startsWith("expire:"));
    expect(expires).toEqual(["expire:scan:1.1.1.1:7200"]);
  });

  it("bloqueia ao passar do limite e informa quanto falta da janela", async () => {
    const store = fakeStore();
    for (let i = 0; i < 4; i++) await checkRateLimit("scan:1.1.1.1", 4, 7200, store);
    const r = await checkRateLimit("scan:1.1.1.1", 4, 7200, store);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
    expect(r.retryAfterSeconds).toBe(7200);
  });

  it("isola chaves diferentes", async () => {
    const store = fakeStore();
    for (let i = 0; i < 4; i++) await checkRateLimit("scan:1.1.1.1", 4, 7200, store);
    const outro = await checkRateLimit("scan:2.2.2.2", 4, 7200, store);
    expect(outro.allowed).toBe(true);
  });

  it("usa a janela cheia quando o TTL veio ausente", async () => {
    // TTL -1 = chave sem expiração registrada. Nunca deve virar Retry-After
    // negativo, que o navegador interpretaria como 'pode tentar já'.
    const store = fakeStore();
    const semTtl: RateLimitStore = { ...store, async ttl() { return -1; } };
    for (let i = 0; i < 5; i++) await checkRateLimit("scan:1.1.1.1", 4, 7200, semTtl);
    const r = await checkRateLimit("scan:1.1.1.1", 4, 7200, semTtl);
    expect(r.retryAfterSeconds).toBe(7200);
  });

  it("propaga o erro do store em vez de engolir", async () => {
    // quem decide o que fazer quando a infra cai é a camada HTTP (Task 3),
    // não o contador.
    const store: RateLimitStore = {
      async incr() { throw new Error("upstash fora"); },
      async expire() { return 1; },
      async ttl() { return -1; },
    };
    await expect(checkRateLimit("scan:1.1.1.1", 4, 7200, store)).rejects.toThrow("upstash fora");
  });

  it("repara chaves órfãs (sem TTL) ao ultrapassar o limite", async () => {
    // Simular chave que perdeu o TTL (ex.: EXPIRE falhou após INCR).
    // Quando a chave órfã é consultada e já ultrapassou o limite, o auto-reparo
    // chama expire de novo para evitar bloqueio permanente.
    const store = fakeStore();
    const key = "scan:1.1.1.1";

    // Atingir o limite normalmente (EXPIRE é definido)
    for (let i = 0; i < 4; i++) {
      await checkRateLimit(key, 4, 7200, store);
    }

    // Limpar as chamadas registradas até aqui
    store.calls.length = 0;

    // Forçar TTL -1 a partir de agora (simular chave órfã)
    const storeOrfao: RateLimitStore = {
      ...store,
      async ttl() { return -1; },
    };

    // Quinta requisição: já ultrapassou o limite, TTL está ausente
    const r = await checkRateLimit(key, 4, 7200, storeOrfao);

    // Deve bloquear e tentar reparar
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSeconds).toBe(7200);

    // O auto-reparo deve ter chamado expire de novo
    const expireCalls = store.calls.filter((c) => c.startsWith("expire:"));
    expect(expireCalls).toContain(`expire:${key}:7200`);
  });

  it("NÃO repara (nem estende o TTL) quando a chave já tem TTL vivo", async () => {
    // O guard `ttl < 0` é o que garante que a janela fixa não vira janela
    // infinita: se o reparo disparasse com TTL positivo, cada requisição de
    // quem já estourou o limite renovaria a expiração e o bloqueio nunca zeraria.
    const store = fakeStore();
    const key = "scan:1.1.1.1";

    for (let i = 0; i < 4; i++) {
      await checkRateLimit(key, 4, 7200, store);
    }
    store.calls.length = 0;

    const storeComTtl: RateLimitStore = {
      ...store,
      async ttl() { return 1800; },
    };

    const r = await checkRateLimit(key, 4, 7200, storeComTtl);

    expect(r.allowed).toBe(false);
    expect(r.retryAfterSeconds).toBe(1800);

    const expireCalls = store.calls.filter((c) => c.startsWith("expire:"));
    expect(expireCalls).toEqual([]);
  });
});
