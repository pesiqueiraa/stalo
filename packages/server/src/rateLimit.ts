import "server-only";
import { defaultStore } from "./memoryStore";

// Rate limiting por JANELA FIXA. Uma chave por bucket+IP (ex.:
// "rl:scan:1.2.3.4"), com validade igual à janela: quando ela vence, a chave
// some e a janela recomeça sozinha.
//
// O contador já morou no Postgres e no Upstash; hoje vive em memória, no
// processo da função (ver memoryStore.ts para o trade-off assumido — o limite
// é por instância e some em cold start). Esta função não sabe onde ele mora:
// tudo passa pela RateLimitStore, e trocar de casa é implementar a interface.
//
// O auto-reparo abaixo existe porque incr() e expire() são operações
// SEPARADAS: num store remoto, a segunda pode falhar depois da primeira ter
// funcionado, deixando uma chave com contagem e sem validade — que nunca mais
// receberia uma, já que só a definimos quando count === 1, e o IP ficaria
// bloqueado para sempre. Com o store em memória isso não acontece (não há I/O
// entre as duas), mas o contrato da interface admite, e o guard custa 3 linhas.

// O mínimo que o contador precisa de um armazenamento. Existir como interface
// é o que permite testar sem rede (ver rateLimit.test.ts) e o que tornou a
// troca de Upstash para memória uma mudança de um arquivo só.
export interface RateLimitStore {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  ttl(key: string): Promise<number>;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  store: RateLimitStore = defaultStore(),
): Promise<RateLimitResult> {
  const count = await store.incr(key);

  // primeira requisição da janela: só aqui o TTL é definido. Renovar o TTL a
  // cada requisição transformaria a janela fixa em janela infinita para quem
  // continua batendo.
  if (count === 1) await store.expire(key, windowSeconds);

  if (count <= limit) {
    return { allowed: true, remaining: limit - count, retryAfterSeconds: 0 };
  }

  // TTL negativo = chave sem expiração conhecida; cai na janela cheia para o
  // Retry-After nunca sair negativo (o navegador leria como "tente agora").
  const ttl = await store.ttl(key);

  // Auto-reparo: se a chave órfã (sem TTL) já ultrapassou o limite, defina
  // a expiração aqui mesmo para evitar bloqueio permanente.
  if (ttl < 0) {
    await store.expire(key, windowSeconds);
  }

  return {
    allowed: false,
    remaining: 0,
    retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
  };
}
