import { NextResponse } from "next/server";
import { runDeepDive } from "@stalo/server";
import { validateIdeaPayload } from "@/lib/aiPayload";
import { DIVE_LIMIT, enforceRateLimit } from "@/lib/rateLimit";

// POST /api/dive — "Mergulhar": gera o relatório fundo (IA) a partir da ideia
// que o CLIENTE manda no corpo (não há mais banco para buscá-la — os dados do
// visitante vivem no localStorage, ver apps/web/src/lib/storage.ts). Esta
// rota não guarda nada; quem persiste o resultado é o navegador, em
// requestDeepDive (apps/web/src/lib/api.ts) — inclusive o cache, que por isso
// saiu daqui.
// A chave da IA nunca chega ao client — tudo roda aqui no servidor.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const parsed = validateIdeaPayload(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { idea } = parsed;

  // rate limit ANTES de chamar a IA — uma recusa de payload (acima) já não
  // chega até aqui, e não deve consumir cota
  const limited = await enforceRateLimit(
    request,
    DIVE_LIMIT.bucket,
    DIVE_LIMIT.limit,
    DIVE_LIMIT.windowSeconds,
    { failClosed: true },
  );
  if (limited) return limited;

  try {
    const dive = await runDeepDive(idea);
    return NextResponse.json(dive);
  } catch (err) {
    console.error("deep dive failed", err);
    const detail =
      process.env.NODE_ENV !== "production" && err instanceof Error ? ` — ${err.message}` : "";
    return NextResponse.json(
      { error: `Não consegui aprofundar essa ideia agora.${detail}` },
      { status: 502 },
    );
  }
}
