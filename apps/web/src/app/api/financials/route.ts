import { NextResponse } from "next/server";
import { runFinancials } from "@stalo/server";
import { validateIdeaPayload } from "@/lib/aiPayload";
import { enforceRateLimit, FINANCIALS_LIMIT } from "@/lib/rateLimit";

// POST /api/financials — "Aprofundar": análise financeira (2º nível), por
// cima do mergulho, a partir da ideia que o CLIENTE manda no corpo (mesma
// mudança de /api/dive: não há mais banco para buscá-la). Esta rota não
// guarda nada; quem persiste (inclusive o cache) é o navegador, em
// requestFinancials (apps/web/src/lib/api.ts).
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
  const { idea, lens } = parsed;

  // o servidor não pode confiar que o cliente checou isso antes de chamar —
  // por isso a checagem continua aqui, mesmo com o atalho equivalente no
  // cliente (apps/web/src/lib/api.ts)
  if (!idea.deepDive) {
    return NextResponse.json(
      { error: "Mergulhe na ideia antes de aprofundar no financeiro." },
      { status: 409 },
    );
  }

  // rate limit ANTES de chamar a IA — payload inválido e a precondição acima
  // não devem consumir cota
  const limited = await enforceRateLimit(
    request,
    FINANCIALS_LIMIT.bucket,
    FINANCIALS_LIMIT.limit,
    FINANCIALS_LIMIT.windowSeconds,
    { failClosed: true },
  );
  if (limited) return limited;

  try {
    const fin = await runFinancials(idea, lens);
    return NextResponse.json(fin);
  } catch (err) {
    console.error("financials failed", err);
    const detail =
      process.env.NODE_ENV !== "production" && err instanceof Error ? ` — ${err.message}` : "";
    return NextResponse.json(
      { error: `Não consegui gerar a análise financeira agora.${detail}` },
      { status: 502 },
    );
  }
}
