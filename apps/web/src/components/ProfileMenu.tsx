"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type Identity = { name: string; email: string; avatar: string | null };

function initialsOf(name: string, email: string): string {
  const src = name.trim() || email.trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (src.slice(0, 2) || "?").toUpperCase();
}

// Avatar no canto do header que abre a "tela de perfil": identidade (Google) e
// sair. A identidade é lida do próprio Supabase no client — sem prop drilling a
// partir do servidor.
export function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<Identity | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

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
        // segue sem identidade — o modal continua útil (sair)
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
    const trigger = triggerRef.current; // capturado no efeito p/ o cleanup devolver o foco
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => closeRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
      trigger?.focus();
    };
  }, [open, close]);

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

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="pm-trigger"
        style={{ ["--ring" as string]: "var(--amber)" }}
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
              <span className="pm-avatar" style={{ ["--ring" as string]: "var(--amber)" }}>
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
