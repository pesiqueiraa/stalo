"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { GoogleButton } from "../GoogleButton";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [errors, setErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
    form?: string;
  }>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  function validate() {
    const e: { name?: string; email?: string; password?: string } = {};
    if (!name.trim()) e.name = "Como podemos te chamar?";
    const mail = email.trim();
    if (!mail) e.email = "Informe seu e-mail.";
    else if (!EMAIL_RE.test(mail)) e.email = "E-mail inválido.";
    if (!password) e.password = "Crie uma senha.";
    else if (password.length < MIN_PASSWORD) e.password = `Mínimo de ${MIN_PASSWORD} caracteres.`;
    return e;
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setLoading(true);
    const supabase = createSupabaseBrowser();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name.trim() } },
    });
    if (error) {
      const msg = /already registered|already exists|user already/i.test(error.message)
        ? "Esse e-mail já tem conta."
        : "Não consegui criar a conta. Tente de novo.";
      setErrors({ form: msg });
      setLoading(false);
      return;
    }
    if (data.session) {
      // confirmação de e-mail desligada no projeto: já entra logado
      router.push("/onboarding");
    } else {
      // confirmação de e-mail ligada: a sessão só vem depois de confirmar
      setNotice(
        "Enviamos um link de confirmação pro seu e-mail. Confirme e depois faça login pra continuar.",
      );
      setLoading(false);
    }
  }

  async function resendConfirmation() {
    if (resendState === "sending") return;
    setResendState("sending");
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.auth.resend({ type: "signup", email: email.trim() });
    setResendState(error ? "error" : "sent");
  }

  return (
    <div className="auth-card">
      <h1 className="auth-h1">Criar conta</h1>
      <p className="auth-sub">Comece seu radar em segundos.</p>

      <GoogleButton label="Criar conta com Google" />
      <div className="auth-divider">
        <span>ou</span>
      </div>

      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="name">Nome</label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            placeholder="Seu nome"
            value={name}
            onChange={(ev) => setName(ev.target.value)}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? "name-error" : undefined}
            disabled={loading}
          />
          {errors.name && (
            <span className="field-error" id="name-error">
              {errors.name}
            </span>
          )}
        </div>

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
              autoComplete="new-password"
              placeholder="Crie uma senha"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? "password-error" : "password-hint"}
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
          {errors.password ? (
            <span className="field-error" id="password-error">
              {errors.password}
            </span>
          ) : (
            <span className="field-hint" id="password-hint">
              Mínimo de {MIN_PASSWORD} caracteres.
            </span>
          )}
        </div>

        {errors.form && <p className="auth-form-error">{errors.form}</p>}
        {notice && (
          <div className="auth-notice">
            {notice}{" "}
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
        )}

        <button type="submit" className="auth-submit" disabled={loading || Boolean(notice)}>
          {loading ? (
            <>
              <span className="auth-spinner" aria-hidden="true" /> Criando conta…
            </>
          ) : (
            "Criar conta"
          )}
        </button>
      </form>

      <p className="auth-terms">
        Ao criar conta, você concorda com os <Link href="/signup">Termos</Link> e a{" "}
        <Link href="/signup">Política de Privacidade</Link>.
      </p>

      <p className="auth-alt">
        Já tem conta? <Link href="/login">Entrar</Link>
      </p>
    </div>
  );
}
