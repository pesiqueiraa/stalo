import { NextResponse } from "next/server";
import { getLens, setLens } from "@stalo/server";
import type { Lens } from "@stalo/shared";
import { getWorkspaceId } from "@/lib/workspace";

const LENSES: Lens[] = ["founder", "investor", "explorer"];

// GET /api/settings — preferências do workspace (hoje só a lente escolhida no
// onboarding). Retorna { lens: null } quando nunca foi definida.
export async function GET() {
  try {
    const lens = await getLens(await getWorkspaceId());
    return NextResponse.json({ lens });
  } catch (err) {
    console.error("getLens failed", err);
    return NextResponse.json({ error: "Não consegui carregar as preferências." }, { status: 500 });
  }
}

// PUT /api/settings — grava a lente do workspace (upsert).
export async function PUT(request: Request) {
  let body: { lens?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  if (typeof body.lens !== "string" || !LENSES.includes(body.lens as Lens)) {
    return NextResponse.json({ error: "Lente inválida." }, { status: 400 });
  }

  try {
    await setLens(await getWorkspaceId(), body.lens as Lens);
    return NextResponse.json({ lens: body.lens });
  } catch (err) {
    console.error("setLens failed", err);
    return NextResponse.json({ error: "Não consegui salvar a preferência." }, { status: 500 });
  }
}
