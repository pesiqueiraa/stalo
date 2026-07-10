"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import "./landing.css"; // pra-quem colapsado no founder (lente única)

// Landing pública. `authed` vem do server component (page.tsx): quem já tem
// sessão vê "Ir ao radar" no lugar dos CTAs de login/cadastro — sem redirect e
// sem flash, porque o botão certo já sai renderizado do servidor.
export default function Landing({ authed }: { authed: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // scroll-reveal das seções via IntersectionObserver (nunca scroll listeners —
  // ver skill 5.D). SSR-safe: as seções nascem visíveis; só ativamos o "esconde
  // e revela" quando há JS + IO + sem reduced-motion. Assim, sem JS ou com
  // movimento reduzido, todo o conteúdo aparece normalmente.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) return;

    const els = Array.from(root.querySelectorAll<HTMLElement>(".reveal"));
    // o que já está na viewport nasce revelado (sem flash de esconde→mostra)
    for (const el of els) {
      if (el.getBoundingClientRect().top < window.innerHeight * 0.92) el.classList.add("in");
    }
    root.classList.add("reveal-ready");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    els.forEach((el) => {
      if (!el.classList.contains("in")) io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  // ---------- radar-grafo do herói (nós = notícias, glifos = insights) ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0,
      H = 0;
    const SECTORS = ["#5ec8d8", "#e8a23d", "#a68bff", "#63d29b", "#ef6d7e"];

    type Node = { a: number; rr: number; c: string; ph: number; sp: number; r: number; lit: number };
    type Insight = { type: string; c: string; a: number; rr: number; ph: number };
    const nodes: Node[] = [];
    const links: [number, number][] = [];
    let insights: Insight[] = [];

    const N = 17;
    for (let i = 0; i < N; i++) {
      nodes.push({
        a: (i / N) * Math.PI * 2 + Math.sin(i * 2.7) * 0.35,
        rr: 0.22 + (((i * 41) % 100) / 100) * 0.62,
        c: SECTORS[i % SECTORS.length],
        ph: (i * 1.7) % (Math.PI * 2),
        sp: 0.28 + (((i * 13) % 10) / 10) * 0.4,
        r: 2 + (((i * 7) % 10) / 10) * 2.6,
        lit: 0,
      });
    }
    for (let k = 0; k < N; k++) {
      links.push([k, (k + 2 + (k % 3)) % N]);
      if (k % 4 === 0) links.push([k, (k + 5) % N]);
    }
    insights = [
      { type: "tri", c: "#63d29b", a: -0.55, rr: 0.33, ph: 0.0 },
      { type: "dia", c: "#ef6d7e", a: 2.25, rr: 0.5, ph: 1.4 },
      { type: "star", c: "#e8a23d", a: 1.05, rr: 0.68, ph: 2.3 },
    ];

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      canvas!.width = Math.max(1, Math.floor(W * DPR));
      canvas!.height = Math.max(1, Math.floor(H * DPR));
      ctx!.setTransform(DPR, 0, 0, DPR, 0, 0);
    }

    function center() {
      const narrow = W < 820;
      return {
        cx: narrow ? W * 0.5 : W * 0.66,
        cy: narrow ? H * 0.34 : H * 0.5,
        R: Math.min(W, H) * (narrow ? 0.52 : 0.46),
      };
    }

    function pos(
      o: { a: number; rr: number; ph: number; sp?: number },
      cx: number,
      cy: number,
      R: number,
      t: number,
    ) {
      const a = o.a + Math.sin(t * (o.sp ?? 0.4) + o.ph) * 0.05;
      const rr = o.rr + Math.sin(t * 0.4 + o.ph) * 0.018;
      return { x: cx + Math.cos(a) * rr * R, y: cy + Math.sin(a) * rr * R, a };
    }

    function glyphPath(type: string, s: number) {
      ctx!.beginPath();
      if (type === "tri") {
        ctx!.moveTo(0, -0.9 * s);
        ctx!.lineTo(0.8 * s, 0.7 * s);
        ctx!.lineTo(-0.8 * s, 0.7 * s);
        ctx!.closePath();
      } else if (type === "dia") {
        ctx!.moveTo(0, -0.95 * s);
        ctx!.lineTo(0.95 * s, 0);
        ctx!.lineTo(0, 0.95 * s);
        ctx!.lineTo(-0.95 * s, 0);
        ctx!.closePath();
      } else {
        const pts = [
          [0, -1], [0.26, -0.26], [1, 0], [0.26, 0.26],
          [0, 1], [-0.26, 0.26], [-1, 0], [-0.26, -0.26],
        ];
        pts.forEach((p, i) => {
          const px = p[0] * s,
            py = p[1] * s;
          if (i === 0) ctx!.moveTo(px, py);
          else ctx!.lineTo(px, py);
        });
        ctx!.closePath();
      }
    }

    let sweep = -Math.PI / 2;

    function frame(t: number) {
      const c = center(),
        cx = c.cx,
        cy = c.cy,
        R = c.R;
      ctx!.clearRect(0, 0, W, H);

      // anéis / graticule
      ctx!.save();
      ctx!.lineWidth = 1;
      for (let g = 1; g <= 4; g++) {
        ctx!.beginPath();
        ctx!.arc(cx, cy, (g / 4.4) * R, 0, Math.PI * 2);
        ctx!.strokeStyle = "rgba(120,150,190," + (0.05 + (4 - g) * 0.012) + ")";
        ctx!.stroke();
      }
      ctx!.strokeStyle = "rgba(120,150,190,0.05)";
      for (let d = 0; d < 12; d++) {
        const ang = (d / 12) * Math.PI * 2;
        ctx!.beginPath();
        ctx!.moveTo(cx + Math.cos(ang) * R * 0.12, cy + Math.sin(ang) * R * 0.12);
        ctx!.lineTo(cx + Math.cos(ang) * R * 0.92, cy + Math.sin(ang) * R * 0.92);
        ctx!.stroke();
      }
      ctx!.restore();

      // varredura
      if (!reduce) {
        const grad = ctx!.createRadialGradient(cx, cy, 0, cx, cy, R * 0.95);
        grad.addColorStop(0, "rgba(94,200,216,0.11)");
        grad.addColorStop(1, "rgba(94,200,216,0)");
        ctx!.save();
        ctx!.beginPath();
        ctx!.moveTo(cx, cy);
        ctx!.arc(cx, cy, R * 0.95, sweep - 0.5, sweep);
        ctx!.closePath();
        ctx!.fillStyle = grad;
        ctx!.fill();
        ctx!.beginPath();
        ctx!.moveTo(cx, cy);
        ctx!.lineTo(cx + Math.cos(sweep) * R * 0.95, cy + Math.sin(sweep) * R * 0.95);
        ctx!.strokeStyle = "rgba(94,200,216,0.28)";
        ctx!.lineWidth = 1.2;
        ctx!.stroke();
        ctx!.restore();
      }

      const P = nodes.map((n) => pos(n, cx, cy, R, t));

      // links (tracejados)
      ctx!.save();
      ctx!.setLineDash([3, 4]);
      ctx!.lineWidth = 1;
      for (const [ia, ib] of links) {
        const A = P[ia],
          B = P[ib];
        ctx!.beginPath();
        ctx!.moveTo(A.x, A.y);
        ctx!.lineTo(B.x, B.y);
        ctx!.strokeStyle = "rgba(232,162,61,0.10)";
        ctx!.stroke();
      }
      ctx!.restore();

      // acendimento por varredura
      for (let n = 0; n < nodes.length; n++) {
        const da = Math.atan2(Math.sin(P[n].a - sweep), Math.cos(P[n].a - sweep));
        if (!reduce && da < 0 && da > -0.32) nodes[n].lit = 1;
        nodes[n].lit *= 0.945;
      }

      // nós
      for (let m = 0; m < nodes.length; m++) {
        const nd = nodes[m],
          p = P[m],
          lit = nd.lit;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, nd.r + lit * 1.6, 0, Math.PI * 2);
        ctx!.fillStyle = nd.c;
        ctx!.globalAlpha = 0.55 + lit * 0.45;
        ctx!.shadowColor = nd.c;
        ctx!.shadowBlur = 6 + lit * 14;
        ctx!.fill();
        ctx!.shadowBlur = 0;
        ctx!.globalAlpha = 1;
      }

      // glifos de insight (pulsando, vazados)
      for (const ins of insights) {
        const ip = pos(ins, cx, cy, R, t);
        const pulse = reduce ? 0.5 : 0.5 + 0.5 * Math.sin(t * 1.3 + ins.ph);
        const size = 11 + pulse * 2.2;
        ctx!.save();
        ctx!.translate(ip.x, ip.y);
        if (!reduce) {
          ctx!.beginPath();
          ctx!.arc(0, 0, size + 5 + pulse * 5, 0, Math.PI * 2);
          ctx!.strokeStyle = ins.c;
          ctx!.globalAlpha = 0.25 * (1 - pulse);
          ctx!.lineWidth = 1;
          ctx!.stroke();
          ctx!.globalAlpha = 1;
        }
        glyphPath(ins.type, size);
        ctx!.fillStyle = ins.c;
        ctx!.globalAlpha = 0.14;
        ctx!.fill();
        ctx!.globalAlpha = 1;
        ctx!.lineWidth = 1.8;
        ctx!.strokeStyle = ins.c;
        ctx!.shadowColor = ins.c;
        ctx!.shadowBlur = 10 + pulse * 8;
        ctx!.stroke();
        ctx!.shadowBlur = 0;
        ctx!.restore();
      }

      // vinheta: nós/glifos desvanecem no fundo antes dos cantos
      const vg = ctx!.createRadialGradient(cx, cy, R * 0.95, cx, cy, R * 1.4);
      vg.addColorStop(0, "rgba(7,11,20,0)");
      vg.addColorStop(1, "rgba(7,11,20,1)");
      ctx!.fillStyle = vg;
      ctx!.fillRect(0, 0, W, H);

      if (!reduce) sweep += 0.006;
    }

    let t0: number | null = null;
    let raf = 0;
    function loop(ts: number) {
      if (t0 === null) t0 = ts;
      frame((ts - t0) / 1000);
      raf = requestAnimationFrame(loop);
    }

    resize();
    if (reduce) {
      frame(0.8);
    } else {
      raf = requestAnimationFrame(loop);
    }

    let ro: ResizeObserver | null = null;
    if ("ResizeObserver" in window) {
      ro = new ResizeObserver(() => {
        resize();
        if (reduce) frame(0.8);
      });
      ro.observe(canvas);
    }
    const onResize = () => {
      resize();
      if (reduce) frame(0.8);
    };
    window.addEventListener("resize", onResize);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div className="lp" ref={rootRef}>
      <div className="atmos" aria-hidden="true" />

      {/* ---------- nav ---------- */}
      <nav className="nav">
        <div className="wrap nav-in">
          <Link className="brand" href="#top">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="lp-logo" src="/logo-branca.svg" alt="Stalo" />
          </Link>
          <div className="nav-links">
            <a href="#veredito">O veredito</a>
            <a href="#evidencia">Evidência</a>
            <a href="#pra-quem">Pra quem</a>
          </div>
          <div className="nav-cta">
            {authed ? (
              <Link className="btn btn-primary" href="/radar">
                Ir ao radar
              </Link>
            ) : (
              <>
                <Link className="btn btn-ghost" href="/login">
                  Entrar
                </Link>
                <Link className="btn btn-primary" href="/signup">
                  Criar conta grátis
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ---------- hero (radar-grafo imersivo) ---------- */}
      <header className="hero" id="top">
        <canvas className="radar-canvas" ref={canvasRef} aria-hidden="true" />
        <div className="hero-scrim" />
        <div className="wrap hero-inner">
          <div className="hero-col">
            <span className="eyebrow">de tese a veredito</span>
            <h1>
              Traga sua tese. Receba um <span className="accent">veredito</span> — com{" "}
              <span className="cross">evidência</span> que você pode checar.
            </h1>
            <p className="lede">
              Escreva o que você quer construir. A IA cruza as notícias frescas e diz: quem já faz,
              o que mudou, onde está o espaço — e se é go, no-go ou pivot.
            </p>
            <div className="cta-row">
              {authed ? (
                <Link className="btn btn-primary" href="/radar">
                  Ir ao radar <span className="arrow">→</span>
                </Link>
              ) : (
                <Link className="btn btn-primary" href="/signup">
                  Criar conta grátis <span className="arrow">→</span>
                </Link>
              )}
              <a className="btn btn-ghost" href="#como">
                Como funciona
              </a>
            </div>
            <div className="legend">
              <span className="legend-item">
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
              <span className="legend-item">
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
              <span className="legend-item">
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
          </div>
        </div>
      </header>

      {/* ---------- o veredito (a saída, veredito-primeiro) ---------- */}
      <section className="band reveal" id="veredito">
        <div className="wrap">
          <div className="sec-head">
            <span className="eyebrow">a saída</span>
            <h2>Uma página. O veredito primeiro, a evidência atrás.</h2>
            <p>
              Não é uma lista de tendências pra você interpretar — isso você acha de graça no
              LinkedIn. É um parecer sobre a sua tese, com o link pra você checar cada afirmação.
            </p>
          </div>

          <div className="verdict-demo">
            <div className="vd-head">
              <div className="vd-head-main">
                <span className="demo-badge">Exemplo ilustrativo</span>
                <span className="vd-eyebrow">Veredito sobre a sua tese</span>
                <strong className="vd-thesis">
                  Antecipação de recebíveis de convênio para clínicas e consultórios pequenos.
                </strong>
                <span className="vd-meta">5 seções · cada afirmação com fonte checável</span>
              </div>
              <div className="vd-seal">
                <span className="vd-call vd-call-pivot">Pivot</span>
                <span className="vd-seal-hint">há algo real — mas não do jeito proposto</span>
              </div>
            </div>
            <ol className="vd-rows">
              <li>
                <span className="vd-num">01</span>
                <div className="vd-row-body">
                  <b>Quem já faz isso no Brasil</b>
                  <p>
                    Cora e Conta Simples já dão crédito PJ; Adiante e Zippi antecipam recebíveis —
                    nenhum especialista em convênio de saúde.
                  </p>
                </div>
                <span className="vd-flag">mata ou salva</span>
              </li>
              <li>
                <span className="vd-num">02</span>
                <div className="vd-row-body">
                  <b>O que mudou nos últimos 90 dias</b>
                  <p>
                    A ANS apertou o prazo de pagamento das operadoras e o padrão TISS digitalizou o
                    recebível — o fluxo virou dado checável.
                  </p>
                </div>
                <span className="vd-flag">timing</span>
              </li>
              <li>
                <span className="vd-num">03</span>
                <div className="vd-row-body">
                  <b>O gap específico</b>
                  <p>
                    Ninguém precifica a glosa — a parte da conta que a operadora nega. Antecipar sem
                    modelar glosa é vender default disfarçado de crédito.
                  </p>
                </div>
              </li>
              <li>
                <span className="vd-num">04</span>
                <div className="vd-row-body">
                  <b>O que mata a ideia</b>
                  <p>
                    Operadoras e grupos que compram carteira já adiantam com capital mais barato — e
                    enxergam a glosa antes de você.
                  </p>
                </div>
                <span className="vd-flag vd-flag-risk">ameaça</span>
              </li>
              <li className="vd-verdict-row">
                <span className="vd-num">05</span>
                <div className="vd-row-body">
                  <b>Go / no-go / pivot</b>
                  <p>
                    Pivot: entre pelo software de gestão de convênio, onde a glosa nasce, e vire a
                    antecipação um botão. Ganha quem tem o fluxo, não o menor custo de capital.
                  </p>
                </div>
              </li>
            </ol>
            <div className="vd-foot">
              Cada linha carrega a fonte. <b>Conexão sem fonte não aparece.</b>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- o cruzamento (o MEIO, não o fim) ---------- */}
      <section className="band reveal" id="cruzamento">
        <div className="wrap">
          <div className="sec-head">
            <h2>O cruzamento não é o produto. É como a IA acha o seu ângulo.</h2>
            <p>
              Você traz a tese; o Stalo cruza os setores que ela toca pra achar onde está o espaço.
              O grafo é a evidência navegável — a prova por trás do veredito, não o fim em si.
            </p>
          </div>

          <div className="crossing-vis">
            <div className="flow-card">
              <span className="fc-label">
                <span className="dot" style={{ background: "var(--cyan)" }} /> Setor A
              </span>
              <p>Data centers de IA fecham contratos gigantes de energia firme.</p>
            </div>
            <span className="flow-op">×</span>
            <div className="flow-card">
              <span className="fc-label">
                <span className="dot" style={{ background: "var(--mint)" }} /> Setor B
              </span>
              <p>Leilões de energia no Nordeste começam a atrair demanda de compute.</p>
            </div>
            <span className="flow-op">=</span>
            <div className="flow-card result">
              <span className="fc-label">O cruzamento</span>
              <strong>“Energy-for-compute” começa a virar categoria — e no Brasil ainda é começo de curva.</strong>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- pra quem ---------- */}
      <section className="band reveal" id="pra-quem">
        <div className="wrap">
          <div className="sec-head">
            <h2>Feito pra quem constrói.</h2>
            <p>Uma ferramenta com um público: o founder que precisa saber se a aposta é real antes de gastar meses construindo.</p>
          </div>

          <div className="founder-showcase">
            <article className="lane founder">
              <span className="lane-kicker">Founder</span>
              <h3>Pra achar a próxima ideia pronta pra construir.</h3>
              <p className="who">Quem constrói sozinho e precisa saber se a aposta é real.</p>
              <p className="desc">
                As <em>oportunidades</em> sobem primeiro no seu brief. Cada uma com o “e daí?” — e o
                mergulho vira um plano de validação com cliente.
              </p>
              <ul>
                <li>Oportunidades lideram o seu brief</li>
                <li>O “e daí?” acionável, não escondido</li>
                <li>Mergulho: passos de validação com gente real</li>
              </ul>
            </article>

            {/* a prova concreta, promovida a coluna própria: o mesmo card "e daí?"
                do produto, com um shimmer de radar sutil (prefers-reduced-motion) */}
            <div className="founder-proof">
              <span className="fp-label">Um exemplo do seu brief</span>
              <div className="mini">
                <div className="m-top">
                  <span className="cd" style={{ background: "var(--cyan)" }} />
                  IA<span className="mx">×</span>
                  <span className="cd" style={{ background: "var(--mint)" }} />
                  Energia · oportunidade
                </div>
                <div className="m-body">
                  <b>E daí? →</b> Broker de capacidade energética pra clusters de GPU. Valide com 5
                  integradores.
                </div>
              </div>
              <p className="fp-note">
                No radar, cada oportunidade chega assim: o ângulo, o “e daí?” e o próximo passo.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- como funciona ---------- */}
      <section className="band reveal" id="como">
        <div className="wrap">
          <div className="sec-head">
            <h2>Três passos. Sem curadoria manual.</h2>
          </div>
          <div className="flow">
            <div className="flow-step">
              <div className="flow-node">
                {/* seus setores: nós de temas nas cores do radar */}
                <svg viewBox="-12 -12 24 24" aria-hidden="true">
                  <circle cx="-5.5" cy="-1" r="3" fill="var(--cyan)" />
                  <circle cx="5" cy="-4.5" r="3" fill="var(--mint)" />
                  <circle cx="1.5" cy="6" r="3" fill="var(--amber)" />
                </svg>
              </div>
              <div className="flow-text">
                <span className="flow-num">01</span>
                <h4>Escolha seus setores</h4>
                <p>Aponte os temas que você quer vigiar. O radar cuida do resto.</p>
              </div>
            </div>
            <div className="flow-step">
              <div className="flow-node">
                {/* o cruzamento: dois nós ligados pela conexão tracejada */}
                <svg viewBox="-12 -12 24 24" aria-hidden="true">
                  <line
                    x1="-6"
                    y1="-5"
                    x2="6"
                    y2="5"
                    stroke="var(--line-2)"
                    strokeWidth="1.4"
                    strokeDasharray="2 2.4"
                  />
                  <circle cx="-6" cy="-5" r="3" fill="var(--cyan)" />
                  <circle cx="6" cy="5" r="3" fill="var(--mint)" />
                </svg>
              </div>
              <div className="flow-text">
                <span className="flow-num">02</span>
                <h4>A IA lê, busca e cruza</h4>
                <p>Uma etapa coleta as notícias recentes; outra cruza os setores atrás da conexão.</p>
              </div>
            </div>
            <div className="flow-step">
              <div className="flow-node">
                {/* a oportunidade: o glifo-estrela do radar */}
                <svg viewBox="-12 -12 24 24" aria-hidden="true">
                  <path
                    d="M0 -10 L2.6 -2.6 L10 0 L2.6 2.6 L0 10 L-2.6 2.6 L-10 0 L-2.6 -2.6 Z"
                    fill="rgba(232,162,61,0.18)"
                    stroke="var(--amber)"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="flow-text">
                <span className="flow-num">03</span>
                <h4>Você guarda e age</h4>
                <p>Salve a tendência, o gap ou a oportunidade. Mergulhe fundo e exporte o resumo, sempre com as fontes.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- evidência ---------- */}
      <section className="band reveal" id="evidencia">
        <div className="wrap evidence">
          <div className="sec-head">
            <span className="eyebrow">confiança por construção</span>
            <h2>Conexão sem fonte não aparece.</h2>
            <p>
              É a regra dura — e é exatamente onde um chatbot genérico inventa. Todo cruzamento carrega as
              notícias que o sustentam: veículo, data e link. E como a busca é sempre por notícia
              fresca, você vê o que um LLM genérico ainda não sabe.
            </p>
          </div>

          <div className="ev-demo">
            <span className="demo-badge">Exemplo ilustrativo</span>
            <div className="ed-top">
              <span className="tag">
                <span className="d" style={{ background: "var(--mint)" }} /> oportunidade
              </span>
              <span className="tag">
                <span className="d" style={{ background: "var(--cyan)" }} /> IA × Energia
              </span>
            </div>
            <h4>Data centers de IA vão brigar por energia firme — e a oferta pronta pra isso ainda é rara</h4>
            <div className="ev-src">
              <span className="name">Reuters</span>
              <span className="txt">hyperscaler fecha PPA de 1,2 GW</span>
              <span className="date">há 2 dias</span>
            </div>
            <div className="ev-src">
              <span className="name">Valor Econômico</span>
              <span className="txt">leilão no NE atrai compute</span>
              <span className="date">há 6 dias</span>
            </div>
            <div className="ev-src">
              <span className="name">Canary Media</span>
              <span className="txt">“energy is the new bottleneck”</span>
              <span className="date">há 11 dias</span>
            </div>
            <div className="ev-discarded">3 conexões sem fonte foram descartadas</div>
          </div>
        </div>
      </section>

      {/* ---------- cta final ---------- */}
      <section className="band final reveal" id="comecar">
        <div className="wrap">
          <h2>Escreva sua tese. Deixe o radar dar o veredito.</h2>
          <p>Você já tem a ideia. Falta o parecer com evidência que você pode checar.</p>
          <div className="cta-row">
            {authed ? (
              <Link className="btn btn-primary" href="/radar">
                Ir ao radar
              </Link>
            ) : (
              <Link className="btn btn-primary" href="/signup">
                Criar conta grátis
              </Link>
            )}
            <a className="btn btn-ghost" href="#veredito">
              Ver como é o veredito
            </a>
          </div>
        </div>
      </section>

      {/* ---------- footer ---------- */}
      <div className="lp-footer">
        <div className="wrap foot">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="lp-logo" src="/logo-branca.svg" alt="Stalo" />
        </div>
      </div>
    </div>
  );
}
