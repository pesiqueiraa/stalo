import "server-only";
import { Redis } from "@upstash/redis";
import type { RateLimitStore } from "./rateLimit";

// Cliente do Upstash (Redis via REST — funciona em serverless, sem pool de
// conexão). SERVER-ONLY: o token nunca chega ao client.
//
// A criação é PREGUIÇOSA, não no import: assim `next build` não quebra quando
// as envs ainda não estão configuradas — o erro só aparece se uma rota de fato
// precisar do contador.

let client: Redis | undefined;

function getClient(): Redis {
  if (client) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL/TOKEN não configuradas. Defina no .env (dev) e no painel do Vercel (prod).",
    );
  }
  client = new Redis({ url, token });
  return client;
}

export function redisStore(): RateLimitStore {
  return {
    incr: (key) => getClient().incr(key),
    expire: (key, seconds) => getClient().expire(key, seconds),
    ttl: (key) => getClient().ttl(key),
  };
}
