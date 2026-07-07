import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { WORKSPACE_COOKIE, WORKSPACE_COOKIE_MAX_AGE } from "@/lib/workspaceCookie";

// Roda na requisição do documento e das rotas /api/*. Faz duas coisas:
//   1) refresca a sessão do Supabase (renova o token e propaga os cookies), pra
//      o usuário logado continuar autenticado nos Server Components e rotas.
//   2) garante um workspace anônimo (cookie) pra quem NÃO está logado — o
//      isolamento de dados sem login (produto.md §2) continua valendo como
//      fallback. Com login, getWorkspaceId usa o user_id no lugar.
//
// Arquivo "proxy" = a convenção do Next 16 que substituiu "middleware".
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });
    // IMPORTANTE: getUser() valida o token e dispara o refresh dos cookies.
    await supabase.auth.getUser();
  }

  // workspace anônimo (fallback pra visitantes sem login): cria o id AQUI, na
  // navegação do documento, ANTES dos fetches paralelos pra /api/* — evita a
  // corrida de três ids diferentes no primeiro load.
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
