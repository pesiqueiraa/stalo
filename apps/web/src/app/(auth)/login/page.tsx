"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { postAuthDestination } from "@/lib/api";
import { GoogleButton } from "../GoogleButton";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [loading, setLoading] = useState(false);
  // conta que ainda não confirmou o e-mail (null = fluxo normal de erro)
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  // OAuth que falhou volta com ?error=oauth; link de confirmação expirado, com ?error=confirm
  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get("error");
    if (err === "oauth") {
      setErrors({ form: "Não consegui entrar com o Google. Tente de novo." });
    } else if (err === "confirm") {
      setErrors({
        form: "Link de confirmação inválido ou expirado. Entre com e-mail e senha pra receber outro.",
      });
    }
  }, []);

  function validate() {
    const e: { email?: string; password?: string } = {};
    const mail = email.trim();
    if (!mail) e.email = "Informe seu e-mail.";
    else if (!EMAIL_RE.test(mail)) e.email = "E-mail inválido.";
    if (!password) e.password = "Informe sua senha.";
    return e;
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setConfirmEmail(null);
    setResendState("idle");
    setLoading(true);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      const unconfirmed =
        error.code === "email_not_confirmed" || /email not confirmed/i.test(error.message);
      if (unconfirmed) {
        setConfirmEmail(email.trim());
      } else {
        // não revela qual campo falhou (segurança)
        setErrors({ form: "E-mail ou senha inválidos." });
      }
      setLoading(false);
      return;
    }
    // novato (sem setores/lente) → onboarding; senão → radar
    router.push(await postAuthDestination());
  }

  async function resendConfirmation() {
    if (!confirmEmail || resendState === "sending") return;
    setResendState("sending");
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.auth.resend({ type: "signup", email: confirmEmail });
    setResendState(error ? "error" : "sent");
  }

  return (
    <div className="auth-card">
      <h1 className="auth-h1">Entrar</h1>
      <p className="auth-sub">Bem-vindo de volta. Retome seu radar.</p>

      <GoogleButton label="Entrar com Google" />
      <div className="auth-divider">
        <span>ou</span>
      </div>

      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="voce@empresa.com"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "email-error" : undefined}
            disabled={loading}
          />
          {errors.email && (
            <span className="field-error" id="email-error">
              {errors.email}
            </span>
          )}
        </div>

        <div className="field">
          <label htmlFor="password">Senha</label>
          <div className="field-pass">
            <input
              id="password"
              type={showPass ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Sua senha"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? "password-error" : undefined}
              disabled={loading}
            />
            <button
              type="button"
              className="pass-toggle"
              onClick={() => setShowPass((s) => !s)}
              aria-label={showPass ? "Ocultar senha" : "Mostrar senha"}
              disabled={loading}
            >
              {showPass ? "ocultar" : "ver"}
            </button>
          </div>
          {errors.password && (
            <span className="field-error" id="password-error">
              {errors.password}
            </span>
          )}
        </div>

        <div className="auth-row">
          <Link href="/login" className="auth-link">
            Esqueci minha senha
          </Link>
        </div>

        {confirmEmail ? (
          <div className="auth-notice">
            Confirme seu e-mail pra entrar. Enviamos um link pra {confirmEmail}.{" "}
            <button
              type="button"
              className="auth-link"
              onClick={resendConfirmation}
              disabled={resendState === "sending"}
            >
              {resendState === "sending"
                ? "Reenviando…"
                : resendState === "sent"
                  ? "Link reenviado ✓"
                  : "Reenviar link"}
            </button>
            {resendState === "error" && (
              <span className="field-error"> Não consegui reenviar. Tente de novo.</span>
            )}
          </div>
        ) : (
          errors.form && <p className="auth-form-error">{errors.form}</p>
        )}

        <button type="submit" className="auth-submit" disabled={loading}>
          {loading ? (
            <>
              <span className="auth-spinner" aria-hidden="true" /> Entrando…
            </>
          ) : (
            "Entrar"
          )}
        </button>
      </form>

      <p className="auth-alt">
        Não tem conta? <Link href="/signup">Criar conta</Link>
      </p>
    </div>
  );
}
