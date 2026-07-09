import { createSupabaseServer } from "@/lib/supabase/server";
import Landing from "./Landing";

// A landing é pública, mas precisa saber se o visitante já tem sessão: nesse
// caso os CTAs de "Entrar / Criar conta" viram um único "Ir ao radar". A
// checagem roda no servidor pra o botão certo já sair renderizado (sem flash).
// Sem sessão, Supabase fora do ar ou erro → trata como deslogado.
export default async function Page() {
  let authed = false;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    try {
      const supabase = await createSupabaseServer();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      authed = !!user;
    } catch {
      // segue como deslogado — a landing pública é o destino seguro
    }
  }
  return <Landing authed={authed} />;
}
