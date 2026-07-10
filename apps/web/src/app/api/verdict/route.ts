import { NextResponse } from "next/server";
import { runVerdict, saveVerdict } from "@stalo/server";
import { getWorkspaceId } from "@/lib/workspace";
import { enforceRateLimit } from "@/lib/rateLimit";

// POST /api/verdict — recebe os SETORES (input primário) e, opcionalmente, a
// tese; gera o veredito no servidor em duas etapas (Coletor com busca web +
// Parecerista), persiste em `verdicts` e devolve o Verdict. O frontend chama
// esta rota em vez de gerar os dados no client, mantendo a chave de IA no
// servidor (CLAUDE.md regra 1). Espelha /api/scan.

// Janelas de recência permitidas (dias). null/ausente = sem limite de data.
const ALLOWED_DAYS = [30, 60, 90];
// Rate limit por IP: mesmo perfil caro do scan (busca web em duas etapas).
const VERDICT_LIMIT = { bucket: "verdict", limit: 12, windowSeconds: 3600 };

export async function POST(request: Request) {
  let build: unknown;
  let forWhom: unknown;
  let sectors: unknown;
  let days: unknown;
  try {
    const body = (await request.json()) as {
      build?: unknown;
      forWhom?: unknown;
      sectors?: unknown;
      days?: unknown;
    };
    build = body.build;
    forWhom = body.forWhom;
    sectors = body.sectors;
    days = body.days;
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  if (!Array.isArray(sectors) || !sectors.every((s) => typeof s === "string")) {
    return NextResponse.json(
      { error: "Envie 'sectors' como uma lista de strings." },
      { status: 400 },
    );
  }
  if (build !== undefined && typeof build !== "string") {
    return NextResponse.json({ error: "'build' deve ser texto." }, { status: 400 });
  }
  if (forWhom !== undefined && typeof forWhom !== "string") {
    return NextResponse.json({ error: "'forWhom' deve ser texto." }, { status: 400 });
  }

  const buildStr = typeof build === "string" ? build.trim() : "";
  const forWhomStr = typeof forWhom === "string" ? forWhom.trim() : "";
  const sectorList = sectors.filter((s) => s.trim().length > 0);

  // O input primário são os SETORES; a tese é opcional. Precisa de pelo menos um
  // dos dois — sem nada não há o que pesquisar.
  if (sectorList.length === 0 && buildStr === "") {
    return NextResponse.json(
      { error: "Escolha ao menos um setor ou escreva sua tese." },
      { status: 400 },
    );
  }

  // janela de recência: só os valores da UI aplicam janela; qualquer outra coisa
  // (null, ausente, inválido) = sem limite de data
  const window = typeof days === "number" && ALLOWED_DAYS.includes(days) ? days : null;

  // rate limit por IP ANTES de chamar a IA — o veredito é caro (busca web em duas
  // etapas). Um 429 aqui não gasta a OpenAI.
  const limited = await enforceRateLimit(
    request,
    VERDICT_LIMIT.bucket,
    VERDICT_LIMIT.limit,
    VERDICT_LIMIT.windowSeconds,
  );
  if (limited) return limited;

  try {
    const verdict = await runVerdict({ build: buildStr, forWhom: forWhomStr }, sectorList, window);
    // persiste para que /api/verdict/latest o recupere ao recarregar a página. Se
    // a gravação falhar, o veredito não é considerado bem-sucedido — não falha
    // silenciosamente (CLAUDE.md).
    await saveVerdict(await getWorkspaceId(), verdict);
    return NextResponse.json(verdict);
  } catch (err) {
    // o erro completo (causa do provider/DB) fica só no log do servidor; o
    // usuário recebe uma mensagem amigável, sem vazar internals (ex.: o texto
    // cru do Postgres) — nem em dev.
    console.error("verdict failed", err);
    return NextResponse.json(
      { error: "Não consegui gerar o veredito agora." },
      { status: 502 },
    );
  }
}
