import { NextResponse } from "next/server";
import { addTopic, countTopics, listTopics, MAX_TOPICS } from "@stalo/server";
import { getWorkspaceId } from "@/lib/workspace";

// GET /api/topics — lista os temas monitorados (ordenados por criação = ordem de cor).
export async function GET() {
  try {
    return NextResponse.json(await listTopics(await getWorkspaceId()));
  } catch (err) {
    console.error("listTopics failed", err);
    return NextResponse.json({ error: "Não consegui carregar os temas." }, { status: 500 });
  }
}

// POST /api/topics — adiciona um tema, validando o limite de 5 e duplicidade.
export async function POST(request: Request) {
  let name: unknown;
  try {
    const body = (await request.json()) as { name?: unknown };
    name = body.name;
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Envie 'name' como texto não vazio." }, { status: 400 });
  }
  const trimmed = name.trim();

  try {
    const wid = await getWorkspaceId();
    if ((await countTopics(wid)) >= MAX_TOPICS) {
      return NextResponse.json(
        { error: `Máximo de ${MAX_TOPICS} temas por vez.` },
        { status: 409 },
      );
    }
    const topic = await addTopic(wid, trimmed);
    if (!topic) {
      return NextResponse.json({ error: "Esse tema já está na lista." }, { status: 409 });
    }
    return NextResponse.json(topic, { status: 201 });
  } catch (err) {
    console.error("addTopic failed", err);
    return NextResponse.json({ error: "Não consegui adicionar o tema." }, { status: 500 });
  }
}
