import { getLens, listTopics } from "@stalo/server";
import { getWorkspaceId } from "@/lib/workspace";
import Landing from "./Landing";

// Landing pública. Sem login: o CTA leva direto ao produto — onboarding pra
// quem ainda não configurou nada (sem temas e sem lente), radar pros demais.
// A checagem roda no servidor pra o botão certo já sair renderizado.
export default async function Page() {
  let dest: "/onboarding" | "/radar" = "/onboarding";
  try {
    const wid = await getWorkspaceId();
    const [topics, lens] = await Promise.all([listTopics(wid), getLens(wid)]);
    if (topics.length > 0 || lens) dest = "/radar";
  } catch {
    // banco fora do ar → onboarding é o destino seguro pra um visitante novo
  }
  return <Landing dest={dest} />;
}
