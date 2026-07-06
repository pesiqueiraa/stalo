import { NextResponse } from "next/server";
import { removeIdea } from "@stalo/server";

// DELETE /api/ideas/:id — remove uma ideia salva.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await removeIdea(id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("removeIdea failed", err);
    return NextResponse.json({ error: "Não consegui remover a ideia." }, { status: 500 });
  }
}
