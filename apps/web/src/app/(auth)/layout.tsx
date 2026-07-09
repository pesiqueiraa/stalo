import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import "./auth.css";

// Layout das telas de acesso (/login e /signup): fundo imersivo de aurora (CSS
// puro, movimento lento) com um card de vidro centrado por cima. O logo fica
// acima do card; a copy de valor vive só no hero da landing. Server component —
// sem canvas/JS de fundo; os formulários (com estado) são client components em
// cada page. A aurora pausa sob prefers-reduced-motion (ver auth.css).
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // Quem já tem sessão válida não deve ver /login nem /signup — vai direto pro
  // radar. Sem isto, quem reabre o site (ou clica em "Entrar" por hábito) re-loga
  // por cima de uma sessão que já estava boa. redirect() lança de propósito, por
  // isso fica FORA do try/catch (senão o catch engoliria o redirect).
  let authed = false;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    try {
      const supabase = await createSupabaseServer();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      authed = !!user;
    } catch {
      // Supabase fora do ar / erro de sessão: segue mostrando a tela de acesso
    }
  }
  if (authed) redirect("/radar");

  return (
    <div className="auth">
      {/* aurora de fundo — blobs desfocados que vagueiam devagar */}
      <div className="auth-aurora" aria-hidden="true">
        <span className="blob b1" />
        <span className="blob b2" />
        <span className="blob b3" />
        <div className="auth-grain" />
      </div>

      <main className="auth-stage">
        <Link href="/" className="auth-brandmark" aria-label="Stalo, página inicial">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-branca.svg" alt="Stalo" />
        </Link>
        {children}
      </main>
    </div>
  );
}
