import { NextResponse, type NextRequest } from "next/server";
import { WORKSPACE_COOKIE, WORKSPACE_COOKIE_MAX_AGE } from "@/lib/workspaceCookie";

// Isolamento de dados sem login (produto.md §2): cada visitante ganha um
// workspace anônimo. O id é criado AQUI, na requisição do documento (a
// navegação para "/" ou "/radar"), ANTES de o client disparar os fetches
// paralelos para /api/*. Isso evita a corrida em que três chamadas simultâneas
// no primeiro load gerariam três ids diferentes — quando os fetches saem, o
// cookie já existe e todos carregam o mesmo id.
//
// Arquivo "proxy" = a convenção do Next 16 que substituiu "middleware".
export function proxy(request: NextRequest) {
  const response = NextResponse.next();
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
