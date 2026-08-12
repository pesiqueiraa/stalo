import { NextResponse } from "next/server";
import { runScan } from "@stalo/server";
import { enforceRateLimit, SCAN_LIMIT } from "@/lib/rateLimit";

// POST /api/scan — recebe a lista de temas, roda o scan no servidor e devolve
// o ScanResult (items + insights). Quem guarda o resultado é o navegador
// (apps/web/src/lib/storage.ts) — esta rota não persiste nada; só fala com a
// IA, mantendo a chave de IA no servidor.
// Janelas de recência permitidas (dias). O frontend oferece estas opções;
// null/ausente = sem limite de data.
const ALLOWED_DAYS = [30, 60, 90];

export async function POST(request: Request) {
  let topics: unknown;
  let days: unknown;
  try {
    const body = (await request.json()) as { topics?: unknown; days?: unknown };
    topics = body.topics;
    days = body.days;
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  if (!Array.isArray(topics) || !topics.every((t) => typeof t === "string")) {
    return NextResponse.json(
      { error: "Envie 'topics' como uma lista de strings." },
      { status: 400 },
    );
  }

  // janela de recência: só os valores da UI aplicam janela; qualquer outra
  // coisa (null, ausente, inválido) = sem limite de data
  const window = typeof days === "number" && ALLOWED_DAYS.includes(days) ? days : null;

  // rate limit ANTES de chamar a IA — o scan é o endpoint mais caro (busca
  // web). Uma recusa aqui não gasta a OpenAI. failClosed: sem contador de pé,
  // é mais barato recusar do que arriscar gasto sem teto.
  const limited = await enforceRateLimit(
    request,
    SCAN_LIMIT.bucket,
    SCAN_LIMIT.limit,
    SCAN_LIMIT.windowSeconds,
    {
      failClosed: true,
      message: "Você usou seus 4 scans desta janela de 2 horas. Volte daqui a pouco.",
    },
  );
  if (limited) return limited;

  try {
    const result = await runScan(topics, window);
    return NextResponse.json(result);
  } catch (err) {
    console.error("scan failed", err);
    // em dev, anexa a causa real à mensagem pra facilitar o diagnóstico
    // (em produção fica só a mensagem genérica, sem vazar internals)
    const detail =
      process.env.NODE_ENV !== "production" && err instanceof Error ? ` — ${err.message}` : "";
    return NextResponse.json(
      { error: `Não consegui buscar ou interpretar as notícias agora.${detail}` },
      { status: 502 },
    );
  }
}
