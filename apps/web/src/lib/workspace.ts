import "server-only";
import { cookies } from "next/headers";
import { WORKSPACE_COOKIE, WORKSPACE_COOKIE_MAX_AGE } from "./workspaceCookie";

// Resolve o "dono do dado" para as rotas /api/* escoparem todo acesso por ele:
// o workspace anônimo do cookie (produto.md §2). Sem login por decisão de
// produto — o isolamento entre visitantes é este id.
export async function getWorkspaceId(): Promise<string> {
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
