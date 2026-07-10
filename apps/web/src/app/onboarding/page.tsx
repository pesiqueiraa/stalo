"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createTopic } from "@/lib/api";
import { savePendingThesis } from "@/lib/thesisHandoff";
import "./onboarding.css";

// Paleta de setores (mesma linguagem do radar). Cada setor escolhido ganha uma
// cor distinta enquanto houver disponível.
const COLORS = ["#5ec8d8", "#63d29b", "#e8a23d", "#a68bff", "#ef6d7e"];
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

// As cinco seções que o veredito responde — as mesmas do VerdictView no radar.
// No fim do onboarding elas viram a "prévia enxuta": o que o parecer vai cobrir,
// sem inventar manchete (o veredito real, de exemplo, abre no radar).
const VERDICT_SECTIONS = [
  "Quem já faz isso no Brasil",
  "O que mudou nos últimos 90 dias",
  "O gap específico",
  "O que mata a ideia",
  "Go / no-go / pivot",
];

type Sector = { id: string; name: string; color: string };
type Step = "tese" | "reveal";
const ORDER: Step[] = ["tese", "reveal"];

// geometria do radar
const CX = 120;
const CY = 120;
const R = 96;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("tese");
  // a tese é o input herói: "quero construir [build] para [forWhom]"
  const [thesisBuild, setThesisBuild] = useState("");
  const [thesisFor, setThesisFor] = useState("");
  const [selected, setSelected] = useState<Sector[]>([]);
  const [custom, setCustom] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);

  const isMax = selected.length >= MAX;
  const count = selected.length;
  const stepIndex = ORDER.indexOf(step);

  // no passo de revelação, "cruza as fontes" por um instante e então mostra que o
  // veredito está pronto. Sem setState síncrono no corpo do efeito: o reveal é
  // agendado num timer (0ms se o usuário pediu menos movimento) e o cleanup zera
  // o estado ao sair do passo — assim reentrar no passo re-anima.
  useEffect(() => {
    if (step !== "reveal") return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => setRevealed(true), reduce ? 0 : 1700);
    return () => {
      clearTimeout(t);
      setRevealed(false);
    };
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

  async function finish() {
    if (saving) return;
    setSaving(true);
    // Setores são opcionais: se houver, persiste como temas do workspace (ordem =
    // ordem de cor no radar). Erros por item são ignorados pra não travar o fluxo.
    for (const s of selected) {
      try {
        await createTopic(s.name);
      } catch {
        // tema duplicado ou no limite: segue em frente
      }
    }
    // Handoff só-frontend: leva a tese pro radar (localStorage), que pré-preenche
    // o compositor e abre o primeiro veredito na chegada. Nada persistido via API.
    savePendingThesis({ build: thesisBuild, forWhom: thesisFor });
    router.push("/radar");
  }

  // prévia estática/ilustrativa: só ecoa a tese digitada no cabeçalho (com um
  // fallback quando em branco) — é daqui que sai a frase da tese na revelação.
  // NÃO gera veredito real: o LLM roda só no radar (o handoff via
  // savePendingThesis leva a tese pra lá, que aí sim chama requestVerdict).
  const preview = {
    thesis: {
      build: thesisBuild.trim() || "crédito de capital de giro na entressafra",
      forWhom: thesisFor.trim() || "pequeno e médio produtor de café",
    },
  };

  // radar reutilizado no refino de setores e na revelação (continuidade visual).
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
        {step === "tese" && (
          <>
            <span className="onb-eyebrow">passo 1 de 2</span>
            <h1 className="onb-h1">O que você quer construir?</h1>
            <p className="onb-sub">
              Sua tese é o ponto de partida. Diga o que quer construir e pra quem — o Stalo devolve um
              veredito de uma página.
            </p>

            {/* compositor da tese: as mesmas classes do ThesisPanel do radar, pra
                a entrada ser idêntica ao input principal de lá */}
            <div className="onb-compose">
              <div className="thesis-compose">
                <label className="thesis-line">
                  <span className="thesis-lead">Quero construir</span>
                  <textarea
                    className="thesis-field"
                    placeholder="crédito de capital de giro na entressafra"
                    value={thesisBuild}
                    onChange={(e) => setThesisBuild(e.target.value)}
                    rows={2}
                    maxLength={140}
                  />
                </label>
                <label className="thesis-line">
                  <span className="thesis-lead">para</span>
                  <textarea
                    className="thesis-field"
                    placeholder="pequeno e médio produtor de café"
                    value={thesisFor}
                    onChange={(e) => setThesisFor(e.target.value)}
                    rows={2}
                    maxLength={140}
                  />
                </label>
              </div>
              <p className="onb-compose-hint">Deixe em branco pra ver um veredito de exemplo.</p>
            </div>

            {/* setores como refino OPCIONAL e secundário — recolhido por padrão */}
            <details className="onb-refine">
              <summary>Cruzar com setores (opcional)</summary>
              <p className="onb-refine-hint">
                O cruzamento é o meio de achar o ângulo, não o fim. Escolha até {MAX} setores pra
                afinar a busca.
              </p>
              {renderRadar()}
              <div className="onb-bank">
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
                {count > 0 && (
                  <div className="onb-refine-count">
                    <b>{count}</b> de {MAX} {count === 1 ? "setor" : "setores"} no radar
                  </div>
                )}
              </div>
            </details>

            <div className="onb-foot">
              <div className="onb-actions">
                <button type="button" className="onb-cta" onClick={() => setStep("reveal")}>
                  Ver meu veredito <span className="arrow">→</span>
                </button>
              </div>
            </div>
          </>
        )}

        {step === "reveal" && (
          <>
            <span className="onb-eyebrow">passo 2 de 2</span>
            <h1 className="onb-h1">{revealed ? "Seu veredito está pronto" : "Cruzando as fontes"}</h1>
            <p className="onb-sub">
              {revealed
                ? "Um parecer de uma página sobre a sua tese. Veja o que ele responde:"
                : "Buscando quem já faz, o que mudou e onde está o gap…"}
            </p>

            <div className="onb-reveal">
              {renderRadar(true)}
              {!revealed ? (
                <p className="onb-scanning">
                  <span className="live">Cruzando as fontes atrás do seu veredito</span>
                  <span className="onb-scan-dots" />
                </p>
              ) : (
                <div className="onb-verdict-preview">
                  <span className="onb-vp-eyebrow">Veredito pronto</span>
                  <p className="onb-vp-thesis">
                    Quero construir <b>{preview.thesis.build}</b> para <b>{preview.thesis.forWhom}</b>.
                  </p>
                  <ul className="onb-vp-sections">
                    {VERDICT_SECTIONS.map((title) => (
                      <li key={title}>{title}</li>
                    ))}
                  </ul>
                  <p className="onb-vp-note">
                    Exemplo ilustrativo — no radar o veredito abre completo, com as fontes por trás de
                    cada afirmação.
                  </p>
                </div>
              )}
            </div>

            <div className="onb-foot">
              <div className="onb-actions">
                <button type="button" className="onb-back" onClick={() => setStep("tese")} disabled={saving}>
                  voltar
                </button>
                <button type="button" className="onb-cta" onClick={finish} disabled={!revealed || saving}>
                  {saving ? (
                    <>
                      <span className="onb-spinner" aria-hidden="true" /> Abrindo…
                    </>
                  ) : (
                    <>
                      Ver meu veredito no radar <span className="arrow">→</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
