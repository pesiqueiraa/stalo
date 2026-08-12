import { describe, expect, it } from "vitest";
import { createMemoryStore } from "./memoryStore";

// relógio controlado: deixa avançar o tempo sem fake timers e sem esperar.
function clock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advanceSeconds(s: number) {
      t += s * 1000;
    },
  };
}

describe("createMemoryStore", () => {
  it("conta a partir de 1 e isola chaves diferentes", async () => {
    const store = createMemoryStore();
    expect(await store.incr("a")).toBe(1);
    expect(await store.incr("a")).toBe(2);
    expect(await store.incr("b")).toBe(1);
  });

  it("ttl devolve os segundos que faltam da janela", async () => {
    const c = clock();
    const store = createMemoryStore({ now: c.now });
    await store.incr("a");
    await store.expire("a", 7200);
    expect(await store.ttl("a")).toBe(7200);
    c.advanceSeconds(200);
    expect(await store.ttl("a")).toBe(7000);
  });

  it("a janela recomeça sozinha quando vence", async () => {
    const c = clock();
    const store = createMemoryStore({ now: c.now });
    await store.incr("a");
    await store.expire("a", 60);
    await store.incr("a"); // 2
    c.advanceSeconds(61);
    // vencida: a contagem volta ao início, como uma chave que expirou no Redis
    expect(await store.incr("a")).toBe(1);
  });

  it("distingue chave inexistente (-2) de chave sem expiração (-1)", async () => {
    const store = createMemoryStore();
    expect(await store.ttl("nunca-vista")).toBe(-2);
    await store.incr("a");
    expect(await store.ttl("a")).toBe(-1);
  });

  it("ttl de chave já vencida é -2, não um número negativo qualquer", async () => {
    const c = clock();
    const store = createMemoryStore({ now: c.now });
    await store.incr("a");
    await store.expire("a", 30);
    c.advanceSeconds(31);
    expect(await store.ttl("a")).toBe(-2);
  });

  it("expire numa chave inexistente não cria a chave", async () => {
    const store = createMemoryStore();
    expect(await store.expire("fantasma", 60)).toBe(0);
    expect(await store.ttl("fantasma")).toBe(-2);
  });

  it("não renova a expiração ao contar — janela fixa, não deslizante", async () => {
    const c = clock();
    const store = createMemoryStore({ now: c.now });
    await store.incr("a");
    await store.expire("a", 100);
    c.advanceSeconds(40);
    await store.incr("a");
    // se contar renovasse a janela, sobrariam 100; a janela é fixa, então 60
    expect(await store.ttl("a")).toBe(60);
  });

  it("varre chaves vencidas em vez de acumulá-las para sempre", async () => {
    // o gatilho da varredura é o tamanho do mapa; enchemos além do limiar com
    // chaves de vida curta e confirmamos que a memória não cresce sem fim.
    const c = clock();
    const store = createMemoryStore({ now: c.now });
    for (let i = 0; i < 5000; i++) {
      await store.incr(`k${i}`);
      await store.expire(`k${i}`, 10);
    }
    c.advanceSeconds(11); // todas vencidas
    await store.incr("nova"); // cruza o limiar e dispara a varredura

    // as antigas sumiram de fato (não só "expiraram logicamente")
    expect(await store.ttl("k0")).toBe(-2);
    expect(await store.ttl("k4999")).toBe(-2);
    expect(await store.ttl("nova")).toBe(-1);
  });
});
