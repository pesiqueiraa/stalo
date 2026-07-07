import Link from "next/link";
import "./auth.css";

// Layout compartilhado das telas de acesso (/login e /signup): split-screen com
// o painel de marca à esquerda (radar + proposta de valor) e o formulário à
// direita. Server component — só markup estático; os formulários (com estado)
// são client components em cada page.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth">
      <aside className="auth-brand">
        <div className="auth-brand-top">
          <Link href="/" aria-label="Stalo, página inicial">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="auth-logo" src="/logo-branca.svg" alt="Stalo" />
          </Link>
          <Link href="/" className="auth-back">
            voltar ao site
          </Link>
        </div>

        <div className="auth-brand-mid">
          {/* radar decorativo estático — ecoa o hero da landing sem o custo do canvas */}
          <svg className="auth-radar" viewBox="0 0 200 200" aria-hidden="true">
            <g fill="none" stroke="rgba(122,152,194,0.16)">
              <circle cx="100" cy="100" r="34" />
              <circle cx="100" cy="100" r="60" />
              <circle cx="100" cy="100" r="84" strokeDasharray="2 5" />
            </g>
            <g stroke="rgba(122,152,194,0.10)">
              <line x1="16" y1="100" x2="184" y2="100" />
              <line x1="100" y1="16" x2="100" y2="184" />
            </g>
            {/* links tracejados (motivo do cruzamento) */}
            <g stroke="rgba(232,162,61,0.28)" strokeWidth="1" strokeDasharray="3 4">
              <line x1="72" y1="70" x2="132" y2="88" />
              <line x1="132" y1="88" x2="96" y2="140" />
            </g>
            {/* nós por setor */}
            <circle cx="72" cy="70" r="4" fill="#5ec8d8" />
            <circle cx="132" cy="88" r="4" fill="#63d29b" />
            <circle cx="96" cy="140" r="3.5" fill="#a68bff" />
            <circle cx="150" cy="140" r="3" fill="#5ec8d8" />
            <circle cx="58" cy="120" r="3" fill="#ef6d7e" />
            {/* glifo de oportunidade (estrela âmbar) no ponto de encontro */}
            <path
              d="M112 108 l2.6 -7.4 l7.4 -2.6 l-7.4 -2.6 l-2.6 -7.4 l-2.6 7.4 l-7.4 2.6 l7.4 2.6 z"
              transform="translate(-2 6)"
              fill="rgba(232,162,61,0.2)"
              stroke="#e8a23d"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>

          <h2 className="auth-brand-head">
            Onde dois setores se <span className="cross">cruzam</span>, mora a{" "}
            <span className="accent">oportunidade</span>.
          </h2>
          <p className="auth-brand-sub">
            Escolha seus setores. A IA cruza as notícias e aponta o gap.
          </p>
        </div>

        <div className="auth-brand-legend">
          <span className="auth-legend-item">
            <svg viewBox="-12 -12 24 24" aria-hidden="true">
              <path
                d="M0 -9 L8 7 L-8 7 Z"
                fill="rgba(99,210,155,0.16)"
                stroke="#63d29b"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
            Tendência
          </span>
          <span className="auth-legend-item">
            <svg viewBox="-12 -12 24 24" aria-hidden="true">
              <path
                d="M0 -9 L9 0 L0 9 L-9 0 Z"
                fill="rgba(239,109,126,0.16)"
                stroke="#ef6d7e"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
            Gap de mercado
          </span>
          <span className="auth-legend-item">
            <svg viewBox="-12 -12 24 24" aria-hidden="true">
              <path
                d="M0 -10 L2.6 -2.6 L10 0 L2.6 2.6 L0 10 L-2.6 2.6 L-10 0 L-2.6 -2.6 Z"
                fill="rgba(232,162,61,0.18)"
                stroke="#e8a23d"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
            Oportunidade
          </span>
        </div>
      </aside>

      <main className="auth-form-side">{children}</main>
    </div>
  );
}
