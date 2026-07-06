"use client";

import { useEffect, useState } from "react";

// Textos da tela de execução, em ordem e EM LOOP: mesmo num scan longo o texto
// segue rodando as quatro frases em vez de travar na última. Fácil de ajustar —
// é só editar o array. As frases ecoam o fluxo Coletor→Analista e a linguagem
// do produto (setores, tendências/gaps/oportunidades, radar).
const PHASES = [
  "buscando notícias e conexões…",
  "cruzando temas entre os setores…",
  "procurando tendências, gaps e oportunidades…",
  "conectando os pontos do radar…",
];
const PHASE_MS = 3500;
const SWEEP_MS = 1600; // igual ao período do feixe (.radar-sweep no globals.css)

// sorteia uma posição pro blip dentro do círculo do radar (coords em % do box),
// evitando o centro e a borda pra não colar no núcleo nem vazar.
function randomBlip(seq: number): { top: string; left: string; seq: number } {
  const angle = Math.random() * Math.PI * 2;
  const radius = 16 + Math.random() * 24; // 16%..40% do raio
  return {
    left: `${(50 + radius * Math.cos(angle)).toFixed(1)}%`,
    top: `${(50 + radius * Math.sin(angle)).toFixed(1)}%`,
    seq,
  };
}

// Overlay do scan: radar animado + texto que evolui em loop. Monta só enquanto o
// scan roda (renderizado condicionalmente pelo pai), então os timers zeram a
// cada nova execução.
export function ScanLoader() {
  const [step, setStep] = useState(0);
  const [blip, setBlip] = useState(() => randomBlip(0));

  // texto: avança de fase a cada PHASE_MS, em loop
  useEffect(() => {
    const id = setInterval(() => setStep((s) => s + 1), PHASE_MS);
    return () => clearInterval(id);
  }, []);

  // blip: nova posição a cada passagem do feixe. Respeita prefers-reduced-motion
  // (se o usuário pediu menos movimento, o blip fica parado onde nasceu).
  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = setInterval(() => setBlip((b) => randomBlip(b.seq + 1)), SWEEP_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="graph-loading">
      <div className="radar" aria-hidden="true">
        <span className="radar-sweep" />
        <span className="radar-core" />
        {/* key={blip.seq} remonta o blip a cada troca pra o fade-in tocar de novo */}
        <span key={blip.seq} className="radar-blip" style={{ top: blip.top, left: blip.left }} />
      </div>
      {/* key={step} remonta o span pra o fade-in tocar a cada troca de texto */}
      <span key={step} className="graph-loading-text" aria-live="polite">
        {PHASES[step % PHASES.length]}
      </span>
    </div>
  );
}
