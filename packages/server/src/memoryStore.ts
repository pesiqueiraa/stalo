import "server-only";
import type { RateLimitStore } from "./rateLimit";

// Contador de rate limit EM MEMÓRIA, no processo da própria função.
//
// TRADE-OFF ASSUMIDO (decisão de 2026-08-12): este contador é POR INSTÂNCIA e
// morre em cold start. Duas requisições do mesmo IP que caiam em instâncias
// diferentes do Vercel contam separado, então o limite é furado — segura uso
// casual e repetição acidental, não segura script determinado.
//
// A alternativa era um Redis externo (Upstash), que estava aqui e saiu: um
// limite por IP nunca protegeu contra abuso distribuído (quem quer queimar
// tokens troca de IP), então o que o serviço externo comprava era estreito —
// consistência contra um MESMO IP entre instâncias — e custava mais uma chave
// e mais um serviço num projeto que quer ser 100% grátis e simples.
//
// O que garante dinheiro de verdade é o TETO DE GASTO MENSAL NA OPENAI. Isto
// aqui é fricção contra uso casual, não uma garantia financeira. Se um dia o
// tráfego justificar, trocar de volta é implementar RateLimitStore de novo —
// nada fora deste arquivo muda.

interface Entry {
  count: number;
  // 0 = sem expiração definida (o equivalente ao TTL -1 do Redis)
  expiresAtMs: number;
}

// Acima disto, varremos as chaves vencidas antes de inserir mais. Sem a
// varredura, um pico de IPs distintos deixaria entradas mortas para sempre no
// processo. O número é folgado para o tráfego de um portfólio.
const SWEEP_THRESHOLD = 5000;

export interface MemoryStoreOptions {
  // injetável só para teste: deixa o teste avançar o tempo sem fake timers
  now?: () => number;
}

export function createMemoryStore(options: MemoryStoreOptions = {}): RateLimitStore {
  const now = options.now ?? (() => Date.now());
  const entries = new Map<string, Entry>();

  function expired(entry: Entry, at: number): boolean {
    return entry.expiresAtMs > 0 && at >= entry.expiresAtMs;
  }

  function sweep(at: number): void {
    for (const [key, entry] of entries) {
      if (expired(entry, at)) entries.delete(key);
    }
  }

  return {
    async incr(key) {
      const at = now();
      const entry = entries.get(key);

      // chave nova, ou janela vencida: recomeça do 1 sem expiração — quem
      // define a janela é o expire(), como no Redis.
      if (!entry || expired(entry, at)) {
        if (entries.size >= SWEEP_THRESHOLD) sweep(at);
        entries.set(key, { count: 1, expiresAtMs: 0 });
        return 1;
      }

      entry.count += 1;
      return entry.count;
    },

    async expire(key, seconds) {
      const entry = entries.get(key);
      if (!entry) return 0;
      entry.expiresAtMs = now() + seconds * 1000;
      return 1;
    },

    async ttl(key) {
      const at = now();
      const entry = entries.get(key);
      if (!entry || expired(entry, at)) return -2; // chave inexistente
      if (entry.expiresAtMs === 0) return -1; // existe, sem expiração
      return Math.ceil((entry.expiresAtMs - at) / 1000);
    },
  };
}

// Instância padrão do processo. Em dev o Next recarrega os módulos a cada
// mudança; pendurar no globalThis evita que o contador zere a cada hot-reload
// (o mesmo motivo pelo qual o antigo client do banco fazia isso).
const globalForRateLimit = globalThis as unknown as { rateLimitStore?: RateLimitStore };

export function defaultStore(): RateLimitStore {
  globalForRateLimit.rateLimitStore ??= createMemoryStore();
  return globalForRateLimit.rateLimitStore;
}
