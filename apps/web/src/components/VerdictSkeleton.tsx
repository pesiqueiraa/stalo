"use client";

import { useEffect, useState } from "react";

interface VerdictSkeletonProps {
  // a tese que o founder já escreveu; renderizada de verdade no selo pra a espera
  // parecer "o SEU veredito se formando". Vazias → placeholders shimmer.
  build?: string;
  forWhom?: string;
}

// O veredito é um POST bloqueante que roda em série: ① Coletor (busca web, a
// fase lenta) → ② Parecerista (síntese). O client não recebe eventos de fase, mas
// como a ORDEM é real, simulamos a virada por tempo — é honesto, não um spinner
// falso. A fase 1 domina o tempo, então segura ~13s antes de passar pra 2.
const PHASE_2_AFTER_MS = 13_000;

const PHASES = [
  { label: "Buscando as fontes na web", hint: "varrendo notícias recentes dos setores" },
  { label: "Cruzando as evidências e emitindo o parecer", hint: "montando o go / no-go / pivot" },
] as const;

// espelha as 5 seções do VerdictView: número, título real e quantas barras de
// conteúdo fingir. Os títulos reais + a numeração dão a sensação de "já quase lá".
const SECTIONS = [
  { num: "01", title: "Quem já faz isso no Brasil", kind: "players" as const, count: 2 },
  { num: "02", title: "O que mudou nos últimos 90 dias", kind: "lines" as const, count: 3 },
  { num: "03", title: "O gap específico", kind: "para" as const, count: 1 },
  { num: "04", title: "O que mata a ideia", kind: "para" as const, count: 1 },
  { num: "05", title: "Go / no-go / pivot", kind: "call" as const, count: 1 },
];

function Bar({ w }: { w: string }) {
  return <span className="v-sk-bar" style={{ width: w }} aria-hidden="true" />;
}

export function VerdictSkeleton({ build, forWhom }: VerdictSkeletonProps) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    // ao desmontar (loading vira false) o timer é limpo — sem vazamento.
    const t = setTimeout(() => setPhase(1), PHASE_2_AFTER_MS);
    return () => clearTimeout(t);
  }, []);

  const buildText = build?.trim();
  const forText = forWhom?.trim();
  const current = PHASES[phase];

  return (
    <div className="v-skeleton" role="status" aria-live="polite" aria-busy="true">
      {/* (A) progresso honesto de 2 fases, no topo */}
      <div className="v-sk-progress">
        <div className="v-sk-progress-main">
          <span className="v-sk-spinner" aria-hidden="true" />
          <div className="v-sk-progress-text">
            <span className="v-sk-phase-label">{current.label}…</span>
            <span className="v-sk-phase-hint">{current.hint}</span>
          </div>
          <span className="v-sk-step">Passo {phase + 1} de 2</span>
        </div>
        <div className="v-sk-dots" aria-hidden="true">
          <span className={`v-sk-dot ${phase >= 0 ? "is-active" : ""}`} />
          <span className={`v-sk-dot ${phase >= 1 ? "is-active" : ""}`} />
        </div>
      </div>

      {/* selo da tese: texto REAL quando o founder já escreveu */}
      <header className="v-seal v-sk-seal">
        <span className="v-eyebrow">Veredito sobre a sua tese</span>
        {buildText || forText ? (
          <h2 className="v-thesis">
            <span className="v-thesis-con">Quero construir</span>{" "}
            {buildText ? (
              <span className="v-thesis-key">{buildText}</span>
            ) : (
              <span className="v-sk-key-ph" aria-hidden="true" />
            )}{" "}
            <span className="v-thesis-con">para</span>{" "}
            {forText ? (
              <span className="v-thesis-key">{forText}</span>
            ) : (
              <span className="v-sk-key-ph" aria-hidden="true" />
            )}
            <span className="v-thesis-con">.</span>
          </h2>
        ) : (
          <div className="v-sk-seal-ph" aria-hidden="true">
            <Bar w="82%" />
            <Bar w="58%" />
          </div>
        )}
      </header>

      {/* as 5 seções: número + título reais, conteúdo em shimmer */}
      <div className="v-sections">
        {SECTIONS.map((s) => (
          <section className="v-sec" key={s.num}>
            <div className="v-sec-head">
              <span className="v-sec-num">{s.num}</span>
              <div className="v-sk-head-text">
                <h3>{s.title}</h3>
                <Bar w="70%" />
              </div>
            </div>

            {s.kind === "players" && (
              <div className="v-sk-players">
                {Array.from({ length: s.count }).map((_, i) => (
                  <div className="v-sk-player" key={i}>
                    <div className="v-sk-player-top">
                      <Bar w="120px" />
                      <Bar w="52px" />
                    </div>
                    <Bar w="90%" />
                    <Bar w="64%" />
                  </div>
                ))}
              </div>
            )}

            {s.kind === "lines" && (
              <div className="v-sk-lines">
                {Array.from({ length: s.count }).map((_, i) => (
                  <div className="v-sk-line" key={i}>
                    <span className="v-sk-line-mark" aria-hidden="true" />
                    <div className="v-sk-line-body">
                      <Bar w="94%" />
                      <Bar w="48%" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {s.kind === "para" && (
              <div className="v-sk-para">
                <Bar w="96%" />
                <Bar w="88%" />
                <Bar w="40%" />
              </div>
            )}

            {s.kind === "call" && (
              <div className="v-sk-call">
                <span className="v-sk-badge" aria-hidden="true" />
                <div className="v-sk-para">
                  <Bar w="92%" />
                  <Bar w="70%" />
                </div>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
