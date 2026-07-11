"use client";

// Cadastro da newsletter. Aparece uma vez por sessão ao chegar no fim da landing
// e leva por email -> setores -> sucesso. O "Assinar" PERSISTE de verdade: chama
// POST /api/newsletter (upsert em `subscribers`). Só captura email + setores;
// nada de envio de email/ESP por ora. Sucesso avança pro "done"; erro fica
// visível e permite tentar de novo (nunca falha em silêncio — CLAUDE.md).

import { useEffect, useRef, useState } from "react";
import { SUGGESTED_SECTORS } from "@/lib/sectors";
import { subscribeNewsletter } from "@/lib/api";

const SEEN_KEY = "nl_popup_seen"; // uma vez por sessão
const MAX_SECTORS = 5;
const SECTOR_COLORS = ["#5ec8d8", "#63d29b", "#e8a23d", "#a68bff", "#ef6d7e"];

type Stage = "intro" | "email" | "sectors" | "done";

const colorFor = (name: string) =>
  SECTOR_COLORS[Math.max(0, SUGGESTED_SECTORS.indexOf(name)) % SECTOR_COLORS.length];

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export function NewsletterPopup() {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("intro");
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // dispara ao chegar no fim da landing (observa o footer) — uma vez por sessão.
  // Observer próprio: não toca no observer de reveal que já existe no Landing.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (sessionStorage.getItem(SEEN_KEY)) return;
    } catch {
      /* sessionStorage indisponível: segue e mostra */
    }
    const footer = document.querySelector(".lp-footer");
    if (!footer || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setOpen(true);
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(footer);
    return () => io.disconnect();
  }, []);

  function dismiss() {
    setOpen(false);
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ok */
    }
  }

  // Esc fecha + foca o card ao abrir / trocar de passo (âncora de foco a11y).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => cardRef.current?.focus(), 40);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open, stage]);

  function toggleSector(name: string) {
    setSelected((prev) => {
      if (prev.includes(name)) return prev.filter((s) => s !== name);
      if (prev.length >= MAX_SECTORS) return prev;
      return [...prev, name];
    });
  }

  // Persiste o assinante e só então avança pro "done". Em erro, mostra a mensagem
  // e mantém o passo pra pessoa tentar de novo (nunca falha em silêncio).
  async function handleSubscribe() {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await subscribeNewsletter(email.trim(), selected);
      setStage("done");
      try {
        sessionStorage.setItem(SEEN_KEY, "1");
      } catch {
        /* ok */
      }
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Não consegui concluir sua inscrição agora.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const emailOk = isValidEmail(email);
  const isMax = selected.length >= MAX_SECTORS;

  return (
    <div className="nl-overlay" onClick={dismiss}>
      <div
        className="nl-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nl-title"
        tabIndex={-1}
        ref={cardRef}
        onClick={(e) => e.stopPropagation()}
      >
        {stage !== "done" && (
          <button className="nl-close" onClick={dismiss} aria-label="Fechar">
            ×
          </button>
        )}

        {stage === "intro" && (
          <div className="nl-intro">
            <div className="nl-hero" aria-hidden="true">
              <span className="nl-ping" />
              <span className="nl-ping nl-ping-2" />
              <span className="nl-hero-badge">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="5" width="18" height="14" rx="2.5" />
                  <path d="M3.5 7.5 L12 13 L20.5 7.5" />
                </svg>
              </span>
            </div>
            <span className="nl-eyebrow nl-eyebrow-pop">✦ acabou de sair</span>
            <h2 className="nl-title nl-title-lg" id="nl-title">
              Acabamos de lançar nossa Newsletter
            </h2>
            <p className="nl-text">
              Insights baseados em notícias frescas, cruzando os setores que você acompanha — toda
              semana, direto no seu email.
            </p>
            <div className="nl-actions">
              <button className="btn btn-primary nl-grow" onClick={() => setStage("email")}>
                Quero! <span className="arrow">→</span>
              </button>
              <button className="btn btn-ghost" onClick={dismiss}>
                agora não
              </button>
            </div>
          </div>
        )}

        {stage === "email" && (
          <>
            <span className="nl-step">passo 1 de 2</span>
            <h2 className="nl-title" id="nl-title">
              Pra onde mandamos?
            </h2>
            <p className="nl-text">Seu melhor email — é por onde o boletim chega toda semana.</p>
            <input
              className="nl-field"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="voce@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setEmailTouched(true)}
              aria-label="Seu email"
            />
            {emailTouched && email.trim() !== "" && !emailOk && (
              <p className="nl-err">Confere o formato do email.</p>
            )}
            <div className="nl-actions">
              <button className="btn btn-ghost" onClick={() => setStage("intro")}>
                voltar
              </button>
              <button
                className="btn btn-primary nl-grow"
                onClick={() => setStage("sectors")}
                disabled={!emailOk}
              >
                Continuar <span className="arrow">→</span>
              </button>
            </div>
          </>
        )}

        {stage === "sectors" && (
          <>
            <span className="nl-step">passo 2 de 2</span>
            <h2 className="nl-title" id="nl-title">
              Quais setores você quer acompanhar?
            </h2>
            <p className="nl-text">
              Escolha até {MAX_SECTORS}. O boletim cruza as notícias desses temas pra você.
            </p>
            <div className="nl-chips">
              {SUGGESTED_SECTORS.map((name) => {
                const active = selected.includes(name);
                return (
                  <button
                    key={name}
                    type="button"
                    className={`nl-chip${active ? " active" : ""}`}
                    style={active ? { color: colorFor(name) } : undefined}
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
            {submitError && <p className="nl-err">{submitError}</p>}
            <div className="nl-actions">
              <button
                className="btn btn-ghost"
                onClick={() => setStage("email")}
                disabled={submitting}
              >
                voltar
              </button>
              <button
                className="btn btn-primary nl-grow"
                onClick={handleSubscribe}
                disabled={selected.length === 0 || submitting}
              >
                {submitting ? (
                  "Assinando…"
                ) : (
                  <>
                    Assinar <span className="arrow">→</span>
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {stage === "done" && (
          <>
            <span className="nl-eyebrow nl-eyebrow-ok">inscrição confirmada</span>
            <h2 className="nl-title" id="nl-title">
              Pronto! Você vai receber o primeiro boletim em breve.
            </h2>
            <p className="nl-text">
              Vamos mandar pra <b className="nl-hl">{email.trim()}</b> as notícias que cruzam:
            </p>
            <div className="nl-done-tags">
              {selected.map((name) => (
                <span className="nl-done-tag" key={name} style={{ color: colorFor(name) }}>
                  <span className="chip-dot" />
                  {name}
                </span>
              ))}
            </div>
            <div className="nl-actions">
              <button className="btn btn-primary nl-grow" onClick={dismiss}>
                Fechar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
