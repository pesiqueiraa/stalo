import { NextResponse, type NextRequest } from "next/server";
import { WORKSPACE_COOKIE, WORKSPACE_COOKIE_MAX_AGE } from "@/lib/workspaceCookie";

// Roda na requisição do documento e das rotas /api/*: garante o workspace
// anônimo (cookie) — o isolamento de dados sem login (produto.md §2). Cria o id
// AQUI, na navegação do documento, ANTES dos fetches paralelos pra /api/* —
// evita a corrida de três ids diferentes no primeiro load.
//
// Arquivo "proxy" = a convenção do Next 16 que substituiu "middleware".
export function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  if (!request.cookies.get(WORKSPACE_COOKIE)) {
    response.cookies.set(WORKSPACE_COOKIE, crypto.randomUUID(), {
      httpOnly: true, // só o servidor lê; o client nunca precisa do id
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production", // em dev (http) precisa ser false pra o cookie colar
      maxAge: WORKSPACE_COOKIE_MAX_AGE,
      path: "/",
    });
  }
  return response;
}

// roda em tudo menos assets estáticos — inclui as páginas e as rotas /api/*
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
