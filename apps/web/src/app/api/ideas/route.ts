import { NextResponse } from "next/server";
import { listIdeas, saveIdea } from "@stalo/server";
import type { InsightType, NewsItem } from "@stalo/shared";

const INSIGHT_TYPES: InsightType[] = ["tendencia", "gap", "oportunidade"];

// GET /api/ideas — lista as ideias salvas (mais recentes primeiro).
export async function GET() {
  try {
    return NextResponse.json(await listIdeas());
  } catch (err) {
    console.error("listIdeas failed", err);
    return NextResponse.json({ error: "Não consegui carregar as ideias." }, { status: 500 });
  }
}

// POST /api/ideas — salva uma ideia a partir de um insight, com o retrato das
// notícias relacionadas no momento do save (não uma referência que expira).
export async function POST(request: Request) {
  let body: {
    insightRef?: unknown;
    type?: unknown;
    title?: unknown;
    description?: unknown;
    rationale?: unknown;
    soWhat?: unknown;
    notes?: unknown;
    relatedItems?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  if (
    typeof body.insightRef !== "string" ||
    typeof body.title !== "string" ||
    !body.title.trim() ||
    typeof body.type !== "string" ||
    !INSIGHT_TYPES.includes(body.type as InsightType)
  ) {
    return NextResponse.json({ error: "Dados da ideia inválidos." }, { status: 400 });
  }

  try {
    const idea = await saveIdea({
      insightRef: body.insightRef,
      type: body.type as InsightType,
      title: body.title,
      description: typeof body.description === "string" ? body.description : "",
      rationale: typeof body.rationale === "string" ? body.rationale : "",
      soWhat: typeof body.soWhat === "string" ? body.soWhat : "",
      notes: typeof body.notes === "string" ? body.notes.slice(0, 500) : "",
      relatedItems: Array.isArray(body.relatedItems) ? (body.relatedItems as NewsItem[]) : [],
    });
    return NextResponse.json(idea, { status: 201 });
  } catch (err) {
    console.error("saveIdea failed", err);
    return NextResponse.json({ error: "Não consegui salvar a ideia." }, { status: 500 });
  }
}
