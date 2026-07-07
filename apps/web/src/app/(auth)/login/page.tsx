"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);

  function validate() {
    const e: { email?: string; password?: string } = {};
    const mail = email.trim();
    if (!mail) e.email = "Informe seu e-mail.";
    else if (!EMAIL_RE.test(mail)) e.email = "E-mail inválido.";
    if (!password) e.password = "Informe sua senha.";
    return e;
  }

  function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    // STUB: sem backend ainda. Simula a autenticação e leva ao radar.
    // Trocar por chamada real de auth quando o backend entrar.
    setLoading(true);
    setTimeout(() => router.push("/radar"), 900);
  }

  return (
    <div className="auth-card">
      <h1 className="auth-h1">Entrar</h1>
      <p className="auth-sub">Bem-vindo de volta. Retome seu radar.</p>

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
