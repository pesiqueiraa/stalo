"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
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

type Identity = { name: string; email: string; avatar: string | null };

function initialsOf(name: string, email: string): string {
  const src = name.trim() || email.trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (src.slice(0, 2) || "?").toUpperCase();
}

interface ProfileMenuProps {
  lens: Lens | null;
  // Persiste a troca de lente (o pai faz setLens + saveLens). Rejeita em falha
  // pra o modal reverter e avisar.
  onLensChange: (lens: Lens) => Promise<void>;
}

// Avatar no canto do header que abre a "tela de perfil": identidade (Google),
// troca de lente e sair. A identidade é lida do próprio Supabase no client — sem
// prop drilling a partir do servidor.
export function ProfileMenu({ lens, onLensChange }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<Identity | null>(null);
  const [savingLens, setSavingLens] = useState<Lens | null>(null);
  const [savedLens, setSavedLens] = useState<Lens | null>(null);
  const [lensError, setLensError] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Identidade: carrega uma vez. getUser valida a sessão; se algo falhar, o
  // avatar cai no fallback de iniciais e o modal ainda funciona pra sair.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const supabase = createSupabaseBrowser();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!alive || !user) return;
        const m = user.user_metadata ?? {};
        setMe({
          name: (m.full_name as string) || (m.name as string) || "",
          email: user.email ?? "",
          avatar: (m.avatar_url as string) || (m.picture as string) || null,
        });
      } catch {
        // segue sem identidade — o modal continua útil (trocar lente / sair)
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

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

  async function signOut() {
    setSigningOut(true);
    try {
      await createSupabaseBrowser().auth.signOut();
    } catch {
      // mesmo se a chamada falhar, forçamos a saída limpando a navegação
    }
    // hard redirect: zera todo o estado do radar em memória e a landing
    // (server) re-renderiza já deslogada.
    window.location.assign("/");
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
        style={{ ["--ring" as string]: activeColor }}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Abrir perfil"
      >
        {me?.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.avatar} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="pm-initials">{me ? initialsOf(me.name, me.email) : "·"}</span>
        )}
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

            {/* identidade */}
            <div className="pm-id">
              <span className="pm-avatar" style={{ ["--ring" as string]: activeColor }}>
                {me?.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={me.avatar} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span className="pm-initials">{me ? initialsOf(me.name, me.email) : "·"}</span>
                )}
              </span>
              <div className="pm-id-text">
                <h2 id="pm-title" className="pm-name">
                  {me?.name || "Sua conta"}
                </h2>
                {me?.email && <p className="pm-email">{me.email}</p>}
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

            {/* sair */}
            <button type="button" className="pm-signout" onClick={signOut} disabled={signingOut}>
              {signingOut ? "Saindo…" : "Sair da conta"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
