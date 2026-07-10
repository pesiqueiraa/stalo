import { NextResponse } from "next/server";
import { getLatestVerdict } from "@stalo/server";
import { getWorkspaceId } from "@/lib/workspace";

// GET /api/verdict/latest — devolve o último veredito salvo (para o frontend
// recarregar o estado ao abrir a página). Retorna { verdict: null } quando
// nunca houve veredito.
export async function GET() {
  try {
    const verdict = await getLatestVerdict(await getWorkspaceId());
    return NextResponse.json({ verdict });
  } catch (err) {
    console.error("getLatestVerdict failed", err);
    return NextResponse.json({ error: "Não consegui carregar o último veredito." }, { status: 500 });
  }
}
