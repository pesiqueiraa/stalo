"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import "./ent-onboarding.css";

// Onboarding do protótipo enterprise: passos próprios (empresa/setor, temas do
// time, convidar colegas, revelação com uma tag do tier empresa) — não persiste
// nada, é só visual (ver plano da branch feat/enterprise). O onboarding pessoal
// (app/onboarding/page.tsx) continua intocado.

const COLORS = ["#5ec8d8", "#63d29b", "#e8a23d", "#a68bff", "#ef6d7e"];
const MIN_TOPICS = 2;
const MAX_TOPICS = 5;

const SUGGESTED_TOPICS = [
  "Inteligência Artificial",
  "Fintech",
  "Cibersegurança",
  "Cloud",
  "Regulação",
  "Mobilidade",
  "Energia",
  "Biotecnologia",
];

type Sector = { id: string; name: string; color: string };
type Step = "empresa" | "temas" | "convidar" | "revelacao";
const ORDER: Step[] = ["empresa", "temas", "convidar", "revelacao"];

const CX = 120;
const CY = 120;
const R = 96;

export default function EnterpriseOnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("empresa");

  const [companyName, setCompanyName] = useState("");
  const [sector, setSector] = useState("");

  const [selected, setSelected] = useState<Sector[]>([]);
  const [customTopic, setCustomTopic] = useState("");

  const [invites, setInvites] = useState<string[]>([]);
  const [customEmail, setCustomEmail] = useState("");

  const [revealed, setRevealed] = useState(false);

  const isMaxTopics = selected.length >= MAX_TOPICS;
  const topicCount = selected.length;
  const stepIndex = ORDER.indexOf(step);

  useEffect(() => {
    if (step !== "revelacao") {
      setRevealed(false);
      return;
    }
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setRevealed(true);
      return;
    }
    const t = setTimeout(() => setRevealed(true), 1700);
    return () => clearTimeout(t);
  }, [step]);

  function addTopic(rawName: string) {
    const name = rawName.trim();
    if (!name) return;
    const id = name.toLowerCase();
    setSelected((prev) => {
      if (prev.length >= MAX_TOPICS) return prev;
      if (prev.some((s) => s.id === id)) return prev;
      const used = new Set(prev.map((s) => s.color));
      const color = COLORS.find((c) => !used.has(c)) ?? COLORS[prev.length % COLORS.length];
      return [...prev, { id, name, color }];
    });
  }
  function toggleTopic(name: string) {
    const id = name.trim().toLowerCase();
    if (selected.some((s) => s.id === id)) {
      setSelected((prev) => prev.filter((s) => s.id !== id));
    } else {
      addTopic(name);
    }
  }
  function onAddCustomTopic(e: React.FormEvent) {
    e.preventDefault();
    addTopic(customTopic);
    setCustomTopic("");
  }

  function addInvite(raw: string) {
    const email = raw.trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    setInvites((prev) => (prev.includes(email) ? prev : [...prev, email]));
  }
  function removeInvite(email: string) {
    setInvites((prev) => prev.filter((e) => e !== email));
  }
  function onAddInvite(e: React.FormEvent) {
    e.preventDefault();
    addInvite(customEmail);
    setCustomEmail("");
  }

  function finish() {
    // protótipo de frontend: não persiste nada, só navega pro dashboard mockado
    router.push("/enterprise");
  }

  const a = selected[0]?.name ?? "";
  const b = selected[1]?.name ?? "";
  const displayCompany = companyName.trim() || "sua empresa";
  const headline = `Entre ${a} e ${b}, um sinal que ${displayCompany} ainda não tinha visto: risco competitivo em formação.`;
  const payoffText = `time inteiro vê o mesmo cruzamento — sem depender de um analista lembrar de avisar os outros.`;

  function renderRadar(compact?: boolean) {
    return (
      <div className={`ento-radar${compact ? " compact" : ""}`}>
        <div className="ento-sweep" aria-hidden="true" />
        <svg className="ento-radar-svg" viewBox="0 0 240 240" aria-hidden="true">
          <g fill="none" stroke="rgba(122,152,194,0.16)">
            <circle cx={CX} cy={CY} r="40" />
            <circle cx={CX} cy={CY} r="72" />
            <circle cx={CX} cy={CY} r="96" strokeDasharray="2 5" />
          </g>
          <g stroke="rgba(122,152,194,0.09)">
            <line x1="20" y1={CY} x2="220" y2={CY} />
            <line x1={CX} y1="20" x2={CX} y2="220" />
          </g>
          <circle className="ento-hub-glow" cx={CX} cy={CY} r="11" fill="var(--accent)" />
          <circle cx={CX} cy={CY} r="3.5" fill="var(--accent)" />
          {selected.map((s, i) => {
            const n = selected.length;
            const ang = -Math.PI / 2 + (i / n) * Math.PI * 2;
            const rad = R * (i % 2 ? 0.82 : 0.56);
            const x = CX + Math.cos(ang) * rad;
            const y = CY + Math.sin(ang) * rad;
            return (
              <g key={s.id} className="ento-node" style={{ transform: `translate(${x}px, ${y}px)` }}>
                <circle className="ento-node-glow" r="13" fill={s.color} />
                <circle className="ento-node-ping" r="6" fill="none" stroke={s.color} strokeWidth="1.5" />
                <circle className="ento-node-core" r="5.5" fill={s.color} />
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  return (
    <div className="ento">
      <div className="ento-top">
        <Link href="/enterprise" aria-label="Stalo Enterprise" className="ento-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="ento-logo" src="/logo-branca.svg" alt="Stalo" />
          <span className="ento-badge">Enterprise</span>
        </Link>
        <div className="ento-steps" aria-hidden="true">
          {ORDER.map((s, i) => (
            <span
              key={s}
              className={`ento-dot${i < stepIndex ? " done" : ""}${i === stepIndex ? " now" : ""}`}
            />
          ))}
        </div>
      </div>

      <main className="ento-main" key={step}>
        {step === "empresa" && (
          <>
            <span className="ento-eyebrow">passo 1 de 4</span>
            <h1 className="ento-h1">Configure o workspace da sua empresa</h1>
            <p className="ento-sub">
              Um radar compartilhado por todo o time começa com quem vocês são.
            </p>

            <form className="ento-form" onSubmit={(e) => { e.preventDefault(); setStep("temas"); }}>
              <div className="ento-field">
                <label htmlFor="ento-company">Nome da empresa</label>
                <input
                  id="ento-company"
                  type="text"
                  placeholder="Ex.: Norte Capital"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="ento-field">
                <label htmlFor="ento-sector">Setor da empresa</label>
                <input
                  id="ento-sector"
                  type="text"
                  placeholder="Ex.: Venture Capital, Consultoria, Indústria…"
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                />
              </div>
            </form>

            <div className="ento-foot">
              <div className="ento-actions">
                <button type="button" className="ento-skip" onClick={() => setStep("temas")}>
                  pular por agora
                </button>
                <button type="button" className="ento-cta" onClick={() => setStep("temas")}>
                  Continuar <span className="arrow">→</span>
                </button>
              </div>
            </div>
          </>
        )}

        {step === "temas" && (
          <>
            <span className="ento-eyebrow">passo 2 de 4</span>
            <h1 className="ento-h1">O que o time vai vigiar?</h1>
            <p className="ento-sub">
              Escolha de 2 a 5 setores. O radar cruza as notícias entre eles pra todo mundo do
              workspace.
            </p>

            {renderRadar()}

            <div className="ento-bank">
              <div className="ento-bank-label">Banco de sinais</div>
              <div className="ento-chips">
                {SUGGESTED_TOPICS.map((name) => {
                  const sel = selected.find((s) => s.id === name.toLowerCase());
                  const active = Boolean(sel);
                  return (
                    <button
                      key={name}
                      type="button"
                      className={`ento-chip${active ? " active" : ""}`}
                      style={active ? { color: sel!.color } : undefined}
                      onClick={() => toggleTopic(name)}
                      disabled={!active && isMaxTopics}
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

              <form className="ento-custom" onSubmit={onAddCustomTopic}>
                <input
                  type="text"
                  placeholder="Adicionar outro setor…"
                  value={customTopic}
                  onChange={(e) => setCustomTopic(e.target.value)}
                  disabled={isMaxTopics}
                  aria-label="Adicionar outro setor"
                />
                <button
                  type="submit"
                  className="ento-add"
                  disabled={isMaxTopics || !customTopic.trim()}
                  aria-label="Adicionar setor"
                >
                  +
                </button>
              </form>
            </div>

            <div className="ento-foot">
              <span className="ento-count">
                <b>{topicCount}</b> de {MAX_TOPICS} ·{" "}
                {topicCount < MIN_TOPICS ? "escolha ao menos 2 setores" : isMaxTopics ? "radar cheio" : "setores no radar"}
              </span>
              <div className="ento-actions">
                <button type="button" className="ento-back" onClick={() => setStep("empresa")}>
                  voltar
                </button>
                <button
                  type="button"
                  className="ento-cta"
                  onClick={() => setStep("convidar")}
                  disabled={topicCount < MIN_TOPICS}
                >
                  Continuar <span className="arrow">→</span>
                </button>
              </div>
            </div>
          </>
        )}

        {step === "convidar" && (
          <>
            <span className="ento-eyebrow">passo 3 de 4</span>
            <h1 className="ento-h1">Convide o time</h1>
            <p className="ento-sub">
              Todo mundo convidado vê o mesmo radar e as mesmas conexões — dá pra convidar depois
              também.
            </p>

            <div className="ento-bank">
              {invites.length > 0 && (
                <>
                  <div className="ento-bank-label">Convites</div>
                  <div className="ento-chips">
                    {invites.map((email) => (
                      <button
                        key={email}
                        type="button"
                        className="ento-chip active"
                        onClick={() => removeInvite(email)}
                      >
                        <span className="chip-dot" />
                        {email}
                        <span className="chip-x" aria-hidden="true">
                          ×
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              <form className="ento-custom" onSubmit={onAddInvite}>
                <input
                  type="email"
                  placeholder="colega@empresa.com"
                  value={customEmail}
                  onChange={(e) => setCustomEmail(e.target.value)}
                  aria-label="E-mail para convidar"
                />
                <button type="submit" className="ento-add" disabled={!customEmail.trim()} aria-label="Adicionar convite">
                  +
                </button>
              </form>
            </div>

            <div className="ento-foot">
              <div className="ento-actions">
                <button type="button" className="ento-back" onClick={() => setStep("temas")}>
                  voltar
                </button>
                <button type="button" className="ento-skip" onClick={() => setStep("revelacao")}>
                  pular
                </button>
                <button type="button" className="ento-cta" onClick={() => setStep("revelacao")}>
                  Ver o primeiro sinal do time <span className="arrow">→</span>
                </button>
              </div>
            </div>
          </>
        )}

        {step === "revelacao" && (
          <>
            <span className="ento-eyebrow">passo 4 de 4</span>
            <h1 className="ento-h1">{revealed ? "O primeiro sinal do time" : "Montando o radar do workspace"}</h1>
            <p className="ento-sub">
              {revealed
                ? "Um cruzamento pronto pra todo mundo que você convidou."
                : `Cruzando os setores que ${displayCompany} está monitorando…`}
            </p>

            <div className="ento-reveal">
              {renderRadar(true)}
              {!revealed ? (
                <p className="ento-scanning">
                  <span className="live">
                    Cruzando {a} × {b}
                  </span>
                  <span className="ento-scan-dots" />
                </p>
              ) : (
                <div className="ento-signal">
                  <div className="ento-signal-tags">
                    <span className="ento-signal-tag warn">⚠ ameaça</span>
                    <span className="ento-signal-tag">
                      <span className="d" style={{ background: "#5ec8d8" }} /> {a} × {b}
                    </span>
                  </div>
                  <h3>{headline}</h3>
                  <div className="ento-signal-payoff">
                    <b style={{ color: "#5ec8d8" }}>Por que compartilhado →</b> {payoffText}
                  </div>
                  <div className="ento-signal-note">
                    prévia · o radar completo do workspace cruza todos os {topicCount} setores, pra
                    todo o time.
                  </div>
                </div>
              )}
            </div>

            <div className="ento-foot">
              <div className="ento-actions">
                <button type="button" className="ento-back" onClick={() => setStep("convidar")}>
                  voltar
                </button>
                <button type="button" className="ento-cta" onClick={finish} disabled={!revealed}>
                  Entrar no workspace <span className="arrow">→</span>
                </button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
