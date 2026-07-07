import Link from "next/link";
import "./auth.css";

// Layout das telas de acesso (/login e /signup): fundo imersivo de aurora (CSS
// puro, movimento lento) com um card de vidro centrado por cima. O logo fica
// acima do card; a copy de valor vive só no hero da landing. Server component —
// sem canvas/JS de fundo; os formulários (com estado) são client components em
// cada page. A aurora pausa sob prefers-reduced-motion (ver auth.css).
export default function AuthLayout({ children }: { children: React.ReactNode }) {
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
