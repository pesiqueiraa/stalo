import { NextResponse } from "next/server";
import { getIdea, runDeepDive, saveDeepDive } from "@stalo/server";

// POST /api/ideas/:id/dive — "Mergulhar": gera o relatório fundo (IA) a partir da
// ideia salva, persiste em saved_ideas.deep_dive e devolve a ideia atualizada.
// A chave da IA nunca chega ao client — tudo roda aqui no servidor.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const idea = await getIdea(id);
    if (!idea) {
      return NextResponse.json({ error: "Ideia não encontrada." }, { status: 404 });
    }
    // se já foi mergulhada, devolve o que está salvo (cache — não re-gasta a IA)
    if (idea.deepDive) {
      return NextResponse.json(idea);
    }
    const dive = await runDeepDive(idea);
    const updated = await saveDeepDive(id, dive);
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
