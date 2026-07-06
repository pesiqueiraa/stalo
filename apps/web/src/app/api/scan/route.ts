import { NextResponse } from "next/server";
import { runScan } from "@stalo/server";
import { saveScan } from "@stalo/server";

// POST /api/scan — recebe a lista de temas, roda o scan no servidor, persiste o
// resultado (scans + news_items + insights) e devolve o ScanResult (items +
// insights). O frontend chama esta rota em vez de gerar os dados no client,
// mantendo a futura chave de IA no servidor.
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

  try {
    const result = await runScan(topics, window);
    // persiste o scan para que /api/scan/latest o recupere ao recarregar a
    // página. Se a gravação falhar, o scan não é considerado bem-sucedido —
    // não falha silenciosamente (CLAUDE.md).
    await saveScan(topics, result);
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
