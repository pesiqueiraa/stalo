import "server-only";
import { sql } from "./db";

// Rate limiting por janela fixa, com o contador no próprio Postgres (Supabase) —
// sem serviço externo (Redis/Upstash) e compartilhado entre as instâncias
// serverless do Vercel, que in-memory não garante. Protege os endpoints de IA
// (scan/dive/financials) de abuso de custo agora que o app é público.
//
// Uma linha por `key` (ex.: "scan:<ip>"), atualizada no lugar — a tabela é
// pequena e limitada pelo nº de IPs ativos. O upsert é atômico (um só statement),
// então é seguro sob requisições concorrentes.

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  // incrementa e devolve a contagem da janela atual; reseta quando a janela
  // (window_start) já passou de windowSeconds.
  const [row] = await sql<{ count: number; window_start: Date | string }[]>`
    INSERT INTO rate_limits (key, window_start, count)
    VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN rate_limits.window_start < now() - (${windowSeconds} * interval '1 second')
        THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE
        WHEN rate_limits.window_start < now() - (${windowSeconds} * interval '1 second')
        THEN now() ELSE rate_limits.window_start END
    RETURNING count, window_start
  `;

  const count = row.count;
  const windowStart =
    row.window_start instanceof Date ? row.window_start : new Date(row.window_start);
  const elapsed = (Date.now() - windowStart.getTime()) / 1000;
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil(windowSeconds - elapsed)),
  };
}
