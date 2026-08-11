import { NextResponse } from "next/server";
import { getIdea, getLens, runFinancials, saveFinancials } from "@stalo/server";
import { getWorkspaceId } from "@/lib/workspace";
import { enforceRateLimit, FINANCIALS_LIMIT } from "@/lib/rateLimit";

// POST /api/ideas/:id/financials — "Aprofundar": análise financeira (2º nível),
// por cima do mergulho. Exige que a ideia já tenha sido mergulhada. Persiste em
// saved_ideas.financials (cache) e devolve a ideia atualizada.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const wid = await getWorkspaceId();
    const idea = await getIdea(wid, id);
    if (!idea) {
      return NextResponse.json({ error: "Ideia não encontrada." }, { status: 404 });
    }
    if (!idea.deepDive) {
      return NextResponse.json(
        { error: "Mergulhe na ideia antes de aprofundar no financeiro." },
        { status: 409 },
      );
    }
    // já analisada: devolve o cache, não re-gasta a IA
    if (idea.financials) {
      return NextResponse.json(idea);
    }
    // rate limit só quando vai de fato gerar (cache acima não consome cota)
    const limited = await enforceRateLimit(
      request,
      FINANCIALS_LIMIT.bucket,
      FINANCIALS_LIMIT.limit,
      FINANCIALS_LIMIT.windowSeconds,
      { failClosed: true },
    );
    if (limited) return limited;
    // a lente do workspace ajusta o foco da análise financeira
    const lens = await getLens(wid);
    const fin = await runFinancials(idea, lens);
    const updated = await saveFinancials(wid, id, fin);
    return NextResponse.json(updated ?? { ...idea, financials: fin });
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
