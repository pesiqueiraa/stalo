import { NextResponse } from "next/server";
import { getLatestScan } from "@stalo/server";
import { getWorkspaceId } from "@/lib/workspace";

// GET /api/scan/latest — devolve o último scan salvo (para o frontend recarregar
// o estado ao abrir a página). Retorna { result: null } quando nunca houve scan.
export async function GET() {
  try {
    const latest = await getLatestScan(await getWorkspaceId());
    if (!latest) return NextResponse.json({ result: null, createdAt: null });
    return NextResponse.json(latest);
  } catch (err) {
    console.error("getLatestScan failed", err);
    return NextResponse.json({ error: "Não consegui carregar o último scan." }, { status: 500 });
  }
}
