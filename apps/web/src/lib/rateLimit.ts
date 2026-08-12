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

// Aplica o rate limit por IP a um endpoint. Devolve null para o handler seguir,
// ou a resposta de recusa. Chame ANTES da chamada cara à IA — assim a recusa
// não gasta a OpenAI.
//
// failClosed: o que fazer quando o PRÓPRIO contador falha.
//   • true  → recusa (503). Use nas rotas que chamam a IA: sem contador não há
//     teto, e errar para o lado de não gastar é mais barato que o contrário.
//   • false → deixa passar. Use no resto: o contador fora não deve derrubar o
//     site inteiro.
//
// message: texto do 429. O padrão serve para qualquer rota; passe um específico
// quando a rota souber dizer algo mais útil ("seus 4 scans desta janela").
export async function enforceRateLimit(
  request: Request,
  bucket: string,
  limit: number,
  windowSeconds: number,
  opts: { failClosed?: boolean; message?: string } = {},
): Promise<NextResponse | null> {
  const key = `rl:${bucket}:${clientIp(request)}`;
  let result;
  try {
    result = await checkRateLimit(key, limit, windowSeconds);
  } catch (err) {
    console.error("rate limit check failed", err);
    if (!opts.failClosed) return null;
    return NextResponse.json(
      { error: "O controle de uso está indisponível agora. Tente de novo em alguns minutos." },
      { status: 503, headers: { "Retry-After": "60" } },
    );
  }

  if (result.allowed) return null;

  return NextResponse.json(
    {
      error:
        opts.message ??
        "Você atingiu o limite de uso por agora. Tente de novo em alguns minutos.",
    },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } },
  );
}

// Limites por endpoint, todos por IP. O scan é o mais caro (busca web na
// OpenAI), por isso a janela maior e o teto menor.
//
// Só o IP: a chave por cookie que existia antes não segurava nada contra script
// — quem abusa manda um cookie novo a cada requisição. Melhor um limite honesto
// do que dois que parecem dois.
const HOUR = 3600;
export const SCAN_LIMIT = { bucket: "scan", limit: 4, windowSeconds: 2 * HOUR };
export const DIVE_LIMIT = { bucket: "dive", limit: 20, windowSeconds: HOUR };
export const FINANCIALS_LIMIT = { bucket: "financials", limit: 20, windowSeconds: HOUR };
