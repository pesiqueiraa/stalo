import { NextResponse } from "next/server";
import { checkRateLimit } from "@stalo/server";

// Descobre o IP do cliente. No Vercel o IP real vem em x-forwarded-for (o
// primeiro da lista); localmente esses headers não existem, então cai em "local"
// (todos compartilham a mesma chave em dev — suficiente para testar o limite).
function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "local";
}

// Aplica o rate limit por IP a um endpoint. Devolve uma resposta 429 (com
// Retry-After) quando estoura, ou null para o handler seguir. Chame ANTES da
// chamada cara à IA — assim o 429 não gasta a OpenAI. O erro é visível ao
// usuário (CLAUDE.md: nunca falhar em silêncio).
export async function enforceRateLimit(
  request: Request,
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<NextResponse | null> {
  const key = `${bucket}:${clientIp(request)}`;
  let allowed: boolean;
  let retryAfterSeconds: number;
  try {
    ({ allowed, retryAfterSeconds } = await checkRateLimit(key, limit, windowSeconds));
  } catch (err) {
    // falha ABERTA: se a infra de rate limit falhar (tabela ausente, banco fora),
    // é melhor deixar passar do que quebrar o endpoint. Loga para percebermos.
    console.error("rate limit check failed (allowing request)", err);
    return null;
  }
  if (allowed) return null;
  return NextResponse.json(
    {
      error:
        "Você atingiu o limite de uso por agora. Tente de novo em alguns minutos.",
    },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

// Limites por endpoint (por IP). Generosos para uso real, restritivos para bot.
const HOUR = 3600;
export const DIVE_LIMIT = { bucket: "dive", limit: 20, windowSeconds: HOUR };
export const FINANCIALS_LIMIT = { bucket: "financials", limit: 20, windowSeconds: HOUR };

// Limite do scan — o endpoint mais caro (busca web na OpenAI). Sem login, este
// é o único freio de custo: 4 scans por janela de 2h, amarrados ao IP E ao
// workspace do cookie — apagar o cookie não renova (o IP segura) e trocar de
// IP não renova (o cookie segura).
const SCAN = { bucket: "scan", limit: 4, windowSeconds: 2 * HOUR };

export async function enforceScanLimit(
  request: Request,
  workspaceId: string,
): Promise<NextResponse | null> {
  const keys = [`${SCAN.bucket}:ip:${clientIp(request)}`, `${SCAN.bucket}:wid:${workspaceId}`];
  let blocked: { retryAfterSeconds: number }[];
  try {
    const results = await Promise.all(
      keys.map((key) => checkRateLimit(key, SCAN.limit, SCAN.windowSeconds)),
    );
    blocked = results.filter((r) => !r.allowed);
  } catch (err) {
    // falha ABERTA, como no enforceRateLimit: infra fora não derruba o endpoint
    console.error("scan limit check failed (allowing request)", err);
    return null;
  }
  if (blocked.length === 0) return null;
  const retryAfter = Math.max(...blocked.map((r) => r.retryAfterSeconds));
  return NextResponse.json(
    { error: "Você usou seus 4 scans desta janela de 2 horas. Volte daqui a pouco." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}
