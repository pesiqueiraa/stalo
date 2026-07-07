"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import "./onboarding.css";

// Paleta de setores (mesma linguagem do radar). Cada setor escolhido ganha uma
// cor distinta enquanto houver disponível.
const COLORS = ["#5ec8d8", "#63d29b", "#e8a23d", "#a68bff", "#ef6d7e"];
const MIN = 2;
const MAX = 5;

const SUGGESTED = [
  "Inteligência Artificial",
  "Energia",
  "Fintech",
  "Biotecnologia",
  "Semicondutores",
  "Cibersegurança",
  "Robótica",
  "Espaço",
  "Clima",
  "Saúde digital",
  "Mobilidade",
  "Web3",
];

// As três lentes do produto: a mesma engine, mas o que o radar destaca muda por
// objetivo. Cada card: ícone + nome + uma frase clara (sem excesso de texto).
const LENSES = [
  {
    id: "founder",
    color: "#e8a23d",
    name: "Founder",
    desc: "Quer achar a próxima ideia pronta pra construir.",
    payoffLabel: "E daí?",
  },
  {
    id: "investor",
    color: "#5ec8d8",
    name: "Investidor",
    desc: "Quer enxergar a categoria antes de virar óbvia.",
    payoffLabel: "O deal",
  },
  {
    id: "explorer",
    color: "#a68bff",
    name: "Explorador",
    desc: "Quer entender pra onde a tecnologia está indo.",
    payoffLabel: "A leitura",
  },
] as const;

// ícones simples por lente (marcas geométricas na cor da lente, via --c)
function renderLensIcon(id: string) {
  const common = {
    viewBox: "-12 -12 24 24",
    fill: "none",
    stroke: "var(--c)",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (id === "founder") {
    // seta pra cima: construir / lançar
    return (
      <svg {...common}>
        <path d="M0 8 V-7" />
        <path d="M-5 -2.5 L0 -8 L5 -2.5" />
      </svg>
    );
  }
  if (id === "investor") {
    // linha subindo: enxergar o movimento do mercado
    return (
      <svg {...common}>
        <path d="M-8 5 L-2.5 -0.5 L1.5 3 L8 -5" />
        <path d="M8 -5 L3.5 -5 M8 -5 L8 -0.5" />
      </svg>
    );
  }
  // bússola no círculo: explorar / navegar tendências
  return (
    <svg {...common} strokeWidth={1.6}>
      <circle cx="0" cy="0" r="8.5" />
      <path d="M0 -4.6 L2.4 0.6 L0 4.6 L-2.4 0.6 Z" fill="var(--c)" fillOpacity="0.18" />
    </svg>
  );
}

type Sector = { id: string; name: string; color: string };
type Step = "sectors" | "lens" | "reveal";
const ORDER: Step[] = ["sectors", "lens", "reveal"];

// geometria do radar
const CX = 120;
const CY = 120;
const R = 96;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("sectors");
  const [selected, setSelected] = useState<Sector[]>([]);
  const [custom, setCustom] = useState("");
  const [lens, setLens] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  const isMax = selected.length >= MAX;
  const count = selected.length;
  const stepIndex = ORDER.indexOf(step);

  // no passo de revelação, "varre" por um instante e então revela o sinal
  useEffect(() => {
    if (step !== "reveal") {
      setRevealed(false);
      return;
    }
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setRevealed(true);
      return;
    }
    const t = setTimeout(() => setRevealed(true), 1700);
    return () => clearTimeout(t);
  }, [step]);

  function addSector(rawName: string) {
    const name = rawName.trim();
    if (!name) return;
    const id = name.toLowerCase();
    setSelected((prev) => {
      if (prev.length >= MAX) return prev;
      if (prev.some((s) => s.id === id)) return prev;
      const used = new Set(prev.map((s) => s.color));
      const color = COLORS.find((c) => !used.has(c)) ?? COLORS[prev.length % COLORS.length];
      return [...prev, { id, name, color }];
    });
  }
  function removeSector(id: string) {
    setSelected((prev) => prev.filter((s) => s.id !== id));
  }
  function toggleSector(name: string) {
    const id = name.trim().toLowerCase();
    if (selected.some((s) => s.id === id)) removeSector(id);
    else addSector(name);
  }
  function onAddCustom(e: React.FormEvent) {
    e.preventDefault();
    addSector(custom);
    setCustom("");
  }

  function finish() {
    // STUB: sem backend ainda. A seleção e a lente ainda não persistem. Quando o
    // backend entrar: criar os temas via /api/topics e guardar a lente escolhida.
    router.push("/radar");
  }

  const activeLens = LENSES.find((l) => l.id === lens) ?? null;
  const a = selected[0]?.name ?? "";
  const b = selected[1]?.name ?? "";
  const payoffText =
    activeLens?.id === "founder"
      ? `um primeiro produto no cruzamento de ${a} e ${b}, validável com poucos clientes.`
      : activeLens?.id === "investor"
        ? `categoria nova em ${a} × ${b}, com poucos players e nenhum consolidado.`
        : `${a} × ${b} está virando tendência; entenda o movimento antes de virar consenso.`;

  // radar reutilizado nos passos de setores e de revelação (continuidade visual).
  // Função inline (não componente aninhado): chamada como {renderRadar()}, os
  // elementos reconciliam por key e os nós não remontam a cada re-render.
  function renderRadar(compact?: boolean) {
    return (
      <div className={`onb-radar${compact ? " compact" : ""}`}>
        <div className="onb-sweep" aria-hidden="true" />
        <svg className="onb-radar-svg" viewBox="0 0 240 240" aria-hidden="true">
          <g fill="none" stroke="rgba(122,152,194,0.16)">
            <circle cx={CX} cy={CY} r="40" />
            <circle cx={CX} cy={CY} r="72" />
            <circle cx={CX} cy={CY} r="96" strokeDasharray="2 5" />
          </g>
          <g stroke="rgba(122,152,194,0.09)">
            <line x1="20" y1={CY} x2="220" y2={CY} />
            <line x1={CX} y1="20" x2={CX} y2="220" />
          </g>
          <circle className="onb-hub-glow" cx={CX} cy={CY} r="11" fill="var(--amber)" />
          <circle cx={CX} cy={CY} r="3.5" fill="var(--amber)" />
          {selected.map((s, i) => {
            const n = selected.length;
            const ang = -Math.PI / 2 + (i / n) * Math.PI * 2;
            const rad = R * (i % 2 ? 0.82 : 0.56);
            const x = CX + Math.cos(ang) * rad;
            const y = CY + Math.sin(ang) * rad;
            return (
              <g key={s.id} className="onb-node" style={{ transform: `translate(${x}px, ${y}px)` }}>
                <circle className="onb-node-glow" r="13" fill={s.color} />
                <circle className="onb-node-ping" r="6" fill="none" stroke={s.color} strokeWidth="1.5" />
                <circle className="onb-node-core" r="5.5" fill={s.color} />
              </g>
            );
          })}
        </svg>
        {!compact && (
          <div className="onb-hint" style={{ opacity: count === 0 ? 1 : 0 }}>
            seu radar está vazio
            <br />
            escolha setores abaixo
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="onb">
      <div className="onb-top">
        <Link href="/" aria-label="Stalo, página inicial">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="onb-logo" src="/logo-branca.svg" alt="Stalo" />
        </Link>
        <div className="onb-steps" aria-hidden="true">
          {ORDER.map((s, i) => (
            <span
              key={s}
              className={`onb-dot${i < stepIndex ? " done" : ""}${i === stepIndex ? " now" : ""}`}
            />
          ))}
        </div>
      </div>

      {/* key={step} faz o miolo re-animar a cada troca de passo */}
      <main className="onb-main" key={step}>
        {step === "sectors" && (
          <>
            <span className="onb-eyebrow">passo 1 de 3</span>
            <h1 className="onb-h1">O que você quer vigiar?</h1>
            <p className="onb-sub">
              Escolha de 2 a 5 setores de tecnologia. O radar cruza as notícias entre eles e aponta
              os gaps.
            </p>

            {renderRadar()}

            <div className="onb-bank">
              <div className="onb-bank-label">Banco de sinais</div>
              <div className="onb-chips">
                {SUGGESTED.map((name) => {
                  const sel = selected.find((s) => s.id === name.toLowerCase());
                  const active = Boolean(sel);
                  return (
                    <button
                      key={name}
                      type="button"
                      className={`onb-chip${active ? " active" : ""}`}
                      style={active ? { color: sel!.color } : undefined}
                      onClick={() => toggleSector(name)}
                      disabled={!active && isMax}
                      aria-pressed={active}
                    >
                      <span className="chip-dot" />
                      {name}
                      {active && (
                        <span className="chip-x" aria-hidden="true">
                          ×
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <form className="onb-custom" onSubmit={onAddCustom}>
                <input
                  type="text"
                  placeholder="Adicionar outro setor…"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  disabled={isMax}
                  aria-label="Adicionar outro setor"
                />
                <button type="submit" className="onb-add" disabled={isMax || !custom.trim()} aria-label="Adicionar setor">
                  +
                </button>
              </form>
            </div>

            <div className="onb-foot">
              <span className="onb-count">
                <b>{count}</b> de {MAX} ·{" "}
                {count < MIN ? "escolha ao menos 2 setores" : isMax ? "radar cheio" : "setores no radar"}
              </span>
              <div className="onb-actions">
                <button type="button" className="onb-skip" onClick={finish}>
                  pular por agora
                </button>
                <button type="button" className="onb-cta" onClick={() => setStep("lens")} disabled={count < MIN}>
                  Continuar <span className="arrow">→</span>
                </button>
              </div>
            </div>
          </>
        )}

        {step === "lens" && (
          <>
            <span className="onb-eyebrow">passo 2 de 3</span>
            <h1 className="onb-h1">Como você vai usar?</h1>
            <p className="onb-sub">
              O radar se ajusta ao seu objetivo. Escolha o que mais te representa.
            </p>

            <div className="onb-lenses">
              {LENSES.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className={`onb-lens${lens === l.id ? " sel" : ""}`}
                  style={{ ["--c" as string]: l.color }}
                  onClick={() => setLens(l.id)}
                  aria-pressed={lens === l.id}
                >
                  <span className="onb-lens-check" aria-hidden="true">
                    ✓
                  </span>
                  <span className="onb-lens-icon">{renderLensIcon(l.id)}</span>
                  <h3>{l.name}</h3>
                  <p className="onb-lens-desc">{l.desc}</p>
                </button>
              ))}
            </div>

            <div className="onb-foot">
              <div className="onb-actions">
                <button type="button" className="onb-back" onClick={() => setStep("sectors")}>
                  voltar
                </button>
                <button type="button" className="onb-cta" onClick={() => setStep("reveal")} disabled={!lens}>
                  Ver meu primeiro sinal <span className="arrow">→</span>
                </button>
              </div>
            </div>
          </>
        )}

        {step === "reveal" && (
          <>
            <span className="onb-eyebrow">passo 3 de 3</span>
            <h1 className="onb-h1">{revealed ? "Seu primeiro sinal" : "Montando seu radar"}</h1>
            <p className="onb-sub">
              {revealed
                ? `Um cruzamento pronto pra você, pela lente ${activeLens?.name}.`
                : "Cruzando os setores que você escolheu…"}
            </p>

            <div className="onb-reveal">
              {renderRadar(true)}
              {!revealed ? (
                <p className="onb-scanning">
                  <span className="live">
                    Cruzando {a} × {b}
                  </span>
                  <span className="onb-scan-dots" />
                </p>
              ) : (
                <div className="onb-signal">
                  <div className="onb-signal-tags">
                    <span className="onb-signal-tag">
                      <span className="d" style={{ background: "#e8a23d" }} /> oportunidade
                    </span>
                    <span className="onb-signal-tag">
                      <span className="d" style={{ background: "#5ec8d8" }} /> {a} × {b}
                    </span>
                  </div>
                  <h3>
                    No encontro de {a} e {b} abre uma categoria que ninguém vende pronta ainda.
                  </h3>
                  <div className="onb-signal-payoff">
                    <b style={{ color: activeLens?.color }}>{activeLens?.payoffLabel} →</b> {payoffText}
                  </div>
                  <div className="onb-signal-note">
                    prévia · sua primeira varredura real cruza todos os {count} setores no radar.
                  </div>
                </div>
              )}
            </div>

            <div className="onb-foot">
              <div className="onb-actions">
                <button type="button" className="onb-back" onClick={() => setStep("lens")}>
                  voltar
                </button>
                <button type="button" className="onb-cta" onClick={finish} disabled={!revealed}>
                  Entrar no radar <span className="arrow">→</span>
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
