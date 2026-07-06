import { NextResponse } from "next/server";
import { removeTopic } from "@stalo/server";

// DELETE /api/topics/:id — remove um tema.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await removeTopic(id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("removeTopic failed", err);
    return NextResponse.json({ error: "Não consegui remover o tema." }, { status: 500 });
  }
}
