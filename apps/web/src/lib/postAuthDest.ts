import "server-only";
import { getLens, listTopics } from "@stalo/server";
import { getWorkspaceId } from "@/lib/workspace";

// Destino pós-autenticação (OAuth ou confirmação de e-mail): quem ainda não
// tem setores nem lente vai pro onboarding; os demais, direto pro radar.
export async function postAuthDest(): Promise<"/onboarding" | "/radar"> {
  try {
    const wid = await getWorkspaceId();
    const [topics, lens] = await Promise.all([listTopics(wid), getLens(wid)]);
    if (topics.length === 0 && !lens) return "/onboarding";
  } catch {
    // se a checagem falhar, o radar é o destino seguro
  }
  return "/radar";
}
