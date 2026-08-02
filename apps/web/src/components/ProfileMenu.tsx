"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Lens } from "@stalo/shared";

// As três lentes, com a mesma cor/ícone/voz do onboarding (fonte visual única do
// produto). Ícone geométrico na cor da lente, via --c. Mantido em sincronia com
// LENSES em onboarding/page.tsx e LENS_LEAD_CATEGORY em lib/ui.
const LENSES: { id: Lens; name: string; desc: string; color: string }[] = [
  { id: "founder", name: "Founder", desc: "Achar a próxima ideia pra construir.", color: "#e8a23d" },
  { id: "investor", name: "Investidor", desc: "Ver a categoria antes de virar óbvia.", color: "#5ec8d8" },
  { id: "explorer", name: "Explorador", desc: "Entender pra onde a tecnologia vai.", color: "#a68bff" },
];

function LensIcon({ id }: { id: Lens }) {
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
    return (
      <svg {...common}>
        <path d="M0 8 V-7" />
        <path d="M-5 -2.5 L0 -8 L5 -2.5" />
      </svg>
    );
  }
  if (id === "investor") {
    return (
      <svg {...common}>
        <path d="M-8 5 L-2.5 -0.5 L1.5 3 L8 -5" />
        <path d="M8 -5 L3.5 -5 M8 -5 L8 -0.5" />
      </svg>
    );
  }
  return (
    <svg {...common} strokeWidth={1.6}>
      <circle cx="0" cy="0" r="8.5" />
      <path d="M0 -4.6 L2.4 0.6 L0 4.6 L-2.4 0.6 Z" fill="var(--c)" fillOpacity="0.18" />
    </svg>
  );
}

interface ProfileMenuProps {
  lens: Lens | null;
  // Persiste a troca de lente (o pai faz setLens + saveLens). Rejeita em falha
  // pra o modal reverter e avisar.
  onLensChange: (lens: Lens) => Promise<void>;
}

// Botão no canto do header que abre as preferências do workspace: troca de lente.
export function ProfileMenu({ lens, onLensChange }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const [savingLens, setSavingLens] = useState<Lens | null>(null);
  const [savedLens, setSavedLens] = useState<Lens | null>(null);
  const [lensError, setLensError] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => setOpen(false), []);

  // Esc fecha; ao abrir, foca o X; ao fechar, devolve o foco pro gatilho.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => closeRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
      triggerRef.current?.focus();
    };
  }, [open, close]);

  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  async function pickLens(next: Lens) {
    if (next === lens || savingLens) return;
    setLensError(false);
    setSavedLens(null);
    setSavingLens(next);
    try {
      await onLensChange(next);
      setSavedLens(next);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSavedLens(null), 1800);
    } catch {
      setLensError(true);
    } finally {
      setSavingLens(null);
    }
  }

  // a lente exibida como ativa acompanha o clique na hora (otimista), antes de o
  // pai propagar a prop
  const activeLens = savingLens ?? lens;
  const activeColor = useMemo(
    () => LENSES.find((l) => l.id === activeLens)?.color ?? "var(--amber)",
    [activeLens],
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="pm-trigger"
        style={{ ["--ring" as string]: activeColor, ["--c" as string]: activeColor }}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Abrir preferências"
      >
        {activeLens ? <LensIcon id={activeLens} /> : <span className="pm-initials">·</span>}
      </button>

      {open && (
        <div className="pm-overlay" onMouseDown={close}>
          <div
            className="pm-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pm-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button ref={closeRef} type="button" className="pm-close" onClick={close} aria-label="Fechar">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </button>

            <div className="pm-id">
              <div className="pm-id-text">
                <h2 id="pm-title" className="pm-name">
                  Preferências
                </h2>
                <p className="pm-email">Como o radar prioriza o seu brief.</p>
              </div>
            </div>

            {/* lente */}
            <div className="pm-section">
              <div className="pm-label-row">
                <span className="pm-label">Sua lente</span>
                {savedLens && <span className="pm-saved">salvo ✓</span>}
                {lensError && <span className="pm-err">não salvou, tente de novo</span>}
              </div>
              <p className="pm-hint">O que sobe primeiro no seu brief.</p>
              <div className="pm-lenses" role="radiogroup" aria-label="Escolha sua lente">
                {LENSES.map((l) => {
                  const active = activeLens === l.id;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={`pm-lens${active ? " sel" : ""}`}
                      style={{ ["--c" as string]: l.color }}
                      onClick={() => pickLens(l.id)}
                      disabled={!!savingLens}
                    >
                      <span className="pm-lens-icon">
                        <LensIcon id={l.id} />
                      </span>
                      <span className="pm-lens-text">
                        <span className="pm-lens-name">{l.name}</span>
                        <span className="pm-lens-desc">{l.desc}</span>
                      </span>
                      <span className="pm-lens-mark" aria-hidden="true">
                        {savingLens === l.id ? <span className="pm-spin" /> : active ? "●" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
