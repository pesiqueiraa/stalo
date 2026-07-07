import { NextResponse } from "next/server";
import { getIdea, getLens, runDeepDive, saveDeepDive } from "@stalo/server";
import { getWorkspaceId } from "@/lib/workspace";
import { DIVE_LIMIT, enforceRateLimit } from "@/lib/rateLimit";

// POST /api/ideas/:id/dive — "Mergulhar": gera o relatório fundo (IA) a partir da
// ideia salva, persiste em saved_ideas.deep_dive e devolve a ideia atualizada.
// A chave da IA nunca chega ao client — tudo roda aqui no servidor.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const wid = await getWorkspaceId();
    const idea = await getIdea(wid, id);
    if (!idea) {
      return NextResponse.json({ error: "Ideia não encontrada." }, { status: 404 });
    }
    // se já foi mergulhada, devolve o que está salvo (cache — não re-gasta a IA)
    if (idea.deepDive) {
      return NextResponse.json(idea);
    }
    // rate limit só quando vai de fato gerar (cache acima não consome cota)
    const limited = await enforceRateLimit(
      request,
      DIVE_LIMIT.bucket,
      DIVE_LIMIT.limit,
      DIVE_LIMIT.windowSeconds,
    );
    if (limited) return limited;
    // a lente do workspace ajusta a linguagem de direcionamento do mergulho
    const lens = await getLens(wid);
    const dive = await runDeepDive(idea, lens);
    const updated = await saveDeepDive(wid, id, dive);
    return NextResponse.json(updated ?? { ...idea, deepDive: dive });
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
