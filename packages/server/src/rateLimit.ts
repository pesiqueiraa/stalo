import "server-only";
import { redisStore } from "./redis";

// Rate limiting por JANELA FIXA. O contador vive no Upstash (Redis) — precisa
// ser compartilhado entre as instâncias serverless do Vercel, que in-memory
// não garante. Antes ficava no Postgres; saiu junto com o banco.
//
// Uma chave por bucket+IP (ex.: "rl:scan:1.2.3.4"), com TTL igual à janela:
// quando o TTL vence, a chave some e a janela recomeça sozinha. INCR é atômico,
// então é seguro sob requisições concorrentes.

// O mínimo que o contador precisa de um Redis. Existir como interface é o que
// permite testar sem rede (ver rateLimit.test.ts).
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
  store: RateLimitStore = redisStore(),
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
  return {
    allowed: false,
    remaining: 0,
    retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
  };
}
