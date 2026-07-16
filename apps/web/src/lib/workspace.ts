import "server-only";
import { cookies } from "next/headers";
import { createSupabaseServer } from "./supabase/server";
import { WORKSPACE_COOKIE, WORKSPACE_COOKIE_MAX_AGE } from "./workspaceCookie";

// Resolve o "dono do dado" para as rotas /api/* escoparem todo acesso por ele.
//
// - Usuário LOGADO: o workspace é o próprio user_id do Supabase (schema §4:
//   "workspace_id vira user_id"). Todo dado criado logado fica sob o user.
// - Visitante SEM login: cai no workspace anônimo do cookie (produto.md §2) —
//   comportamento original preservado como fallback.
// Id do usuário autenticado (Supabase), ou null se a visita é anônima.
export async function getAuthUserId(): Promise<string | null> {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    try {
      const supabase = await createSupabaseServer();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) return user.id;
    } catch {
      // Supabase indisponível/erro de sessão: trata como anônimo
    }
  }
  return null;
}

export async function getWorkspaceId(): Promise<string> {
  // 1) sessão autenticada tem prioridade
  const userId = await getAuthUserId();
  if (userId) return userId;

  // 2) fallback: workspace anônimo do cookie
  const store = await cookies();
  const existing = store.get(WORKSPACE_COOKIE)?.value;
  if (existing) return existing;

  const wid = crypto.randomUUID();
  try {
    store.set(WORKSPACE_COOKIE, wid, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: WORKSPACE_COOKIE_MAX_AGE,
      path: "/",
    });
  } catch {
    // cookies().set pode lançar em contexto read-only; ignora — o proxy
    // cobre o caso normal, e o id gerado ainda escopa esta resposta.
  }
  return wid;
}
