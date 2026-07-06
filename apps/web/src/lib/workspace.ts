import "server-only";
import { cookies } from "next/headers";
import { WORKSPACE_COOKIE, WORKSPACE_COOKIE_MAX_AGE } from "./workspaceCookie";

// Lê o id do workspace anônimo do cookie, para as rotas /api/* escoparem todo
// acesso a dados por visitante (produto.md §2). No fluxo normal do navegador o
// cookie já vem do proxy (ex-middleware), então isto só lê. O fallback (gerar + setar) cobre
// chamadas diretas à API que não passaram pela navegação do documento; nesses
// casos não há paralelismo por cliente, então não há corrida.
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
