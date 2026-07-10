"use client";

import { useCallback, useRef, useState } from "react";
import type { SavedIdea } from "@stalo/shared";
import { labelForType } from "@/lib/ui";
import { useDismiss } from "@/lib/useDismiss";
import { CoverageChart } from "./CoverageChart";
import { DiveHero } from "./DiveHero";

interface DeepDiveViewProps {
  idea: SavedIdea;
  onClose: () => void;
}

// monta o relatório em Markdown, para exportar (copiar) — texto puro, portável
function toMarkdown(idea: SavedIdea): string {
  const dive = idea.deepDive;
  const market = dive?.market;
  const lines: string[] = [];
  lines.push(`# ${idea.title}`, "");
  lines.push(`_${labelForType(idea.type)} · ${idea.description}_`, "");
  if (idea.whyNow) lines.push(`**Por que agora:** ${idea.whyNow}`, "");
  const ta = dive?.typeAnalysis;
  if (ta?.kind === "tendencia") {
    lines.push(`## Estágio da tendência`, ta.estagio, "");
    if (ta.aceleradores.length) {
      lines.push(`**O que acelera:**`);
      ta.aceleradores.forEach((a) => lines.push(`- ${a}`));
      lines.push("");
    }
    if (ta.freios.length) {
      lines.push(`**O que segura:**`);
      ta.freios.forEach((f) => lines.push(`- ${f}`));
      lines.push("");
    }
  } else if (ta?.kind === "gap") {
    if (ta.porqueAberto) lines.push(`## Por que o gap segue aberto`, ta.porqueAberto, "");
    if (ta.cemiterio) lines.push(`## Quem tentou`, ta.cemiterio, "");
    if (ta.aPonte) lines.push(`## O que faria a ponte`, ta.aPonte, "");
  } else if (ta?.kind === "oportunidade") {
    if (ta.beachhead) lines.push(`## O primeiro alvo (beachhead)`, ta.beachhead, "");
    if (ta.menorTeste) lines.push(`## O menor teste`, ta.menorTeste, "");
  }
  if (market && market.players.length) {
    lines.push(`## Quem já joga aqui`);
    market.players.forEach((p) =>
      lines.push(
        `- **${p.nome}** (${p.relacao}) — ${p.oQueFaz}${p.url ? ` [fonte](${p.url})` : ""}`,
      ),
    );
    lines.push("");
  }
  if (market?.ondeValor) lines.push(`## Onde o valor se acumula`, market.ondeValor, "");
  if (market && market.analogas.length) {
    lines.push(`## Jogadas análogas`);
    market.analogas.forEach((a) => lines.push(`- **${a.nome}** — ${a.licao}`));
    lines.push("");
  }
  if (dive?.proximosPassos.length) {
    lines.push(`## Próximos passos`);
    dive.proximosPassos.forEach((p, i) => lines.push(`${i + 1}. ${p}`));
    lines.push("");
  }
  if (dive?.sinais.length) {
    lines.push(`## Sinais a observar`);
    dive.sinais.forEach((s) =>
      lines.push(`- **${s.kind === "risco" ? "Risco" : "A favor"}:** ${s.text}`),
    );
    lines.push("");
  }
  if (idea.notes) lines.push(`## Sua nota`, idea.notes, "");
  return lines.join("\n");
}

export function DeepDiveView({ idea, onClose }: DeepDiveViewProps) {
  const [copied, setCopied] = useState(false);
  const [closing, setClosing] = useState(false);
  const [thesisOpen, setThesisOpen] = useState(false); // "relembrar a tese" recolhível
  const sheetRef = useRef<HTMLDivElement>(null);
  // fecha ao clicar no fundo (fora da folha) ou apertar Esc, além do "← voltar".
  // toca a animação de saída antes de desmontar (o pai só desmonta no onClose).
  const requestClose = useCallback(() => {
    setClosing((already) => {
      if (already) return already;
      const reduce =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (reduce) onClose();
      else window.setTimeout(onClose, 260);
      return true;
    });
  }, [onClose]);
  useDismiss(sheetRef, requestClose, true);
  const dive = idea.deepDive;
  const market = dive?.market ?? null;
  const ta = dive?.typeAnalysis ?? null; // análise específica do tipo (a pergunta central)

  function copyMarkdown() {
    navigator.clipboard?.writeText(toMarkdown(idea)).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => setCopied(false),
    );
  }

  let secNum = 0;
  const num = () => String(++secNum).padStart(2, "0");

  return (
    <div
      className={`dive-overlay dive-accent-${idea.type}${closing ? " closing" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Mergulho na ideia"
    >
      {/* nuvens de fundo na cor do tipo (aurora — como nas telas de acesso) */}
      <div className="dive-aurora" aria-hidden="true">
        <span className="dive-blob db1" />
        <span className="dive-blob db2" />
        <span className="dive-blob db3" />
      </div>
      <div className="dive-ambient" aria-hidden="true">
        <svg viewBox="0 0 620 620">
          <g transform="translate(310,310)">
            {[80, 150, 220, 290].map((r) => (
              <circle key={r} r={r} fill="none" stroke="rgba(255,255,255,0.05)" />
            ))}
          </g>
        </svg>
      </div>

      <div className="dive-sheet" ref={sheetRef}>
        <div className="dive-topbar">
          <span className="dive-eyebrow">Mergulhar · mapa de mercado</span>
          <button className="dive-back" onClick={requestClose}>
            ← voltar ao radar
          </button>
        </div>

        <span className={`detail-type detail-${idea.type}`}>{labelForType(idea.type)}</span>
        <h1 className="dive-title">{idea.title}</h1>
        <p className="dive-punch dive-punch--divider">{idea.description}</p>

        {/* cabeçalho de tese enxuto: o timing em destaque + "relembrar a tese"
            recolhível (rationale/soWhat que já vêm da ideia, sem regenerar) */}
        {(idea.rationale || idea.soWhat || idea.whyNow) && (
          <div className="dive-thesis">
            {idea.whyNow && (
              <p className="dive-thesis-now">
                <span className="dive-thesis-tag">Por que agora</span>
                {idea.whyNow}
              </p>
            )}
            {(idea.rationale || idea.soWhat) && (
              <>
                <button
                  className="dive-thesis-toggle"
                  aria-expanded={thesisOpen}
                  onClick={() => setThesisOpen((v) => !v)}
                >
                  {thesisOpen ? "− relembrar a tese" : "+ relembrar a tese"}
                </button>
                {thesisOpen && (
                  <div className="dive-thesis-body">
                    {idea.rationale && (
                      <p>
                        <span className="dive-thesis-tag">Por que conecta</span>
                        {idea.rationale}
                      </p>
                    )}
                    {idea.soWhat && (
                      <p>
                        <span className="dive-thesis-tag">E daí?</span>
                        {idea.soWhat}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* herói animado do tipo — o masthead que "chama atenção" */}
        <DiveHero type={idea.type} />

        {idea.relatedItems.length > 0 && (
          <section className="dive-sec">
            <div className="dive-sec-label">
              <span className="dive-sec-num">{num()}</span> Cobertura ao longo do tempo
            </div>
            <CoverageChart items={idea.relatedItems} />
          </section>
        )}

        {/* análise ESPECÍFICA do tipo — a pergunta central que muda por tipo */}
        {ta?.kind === "tendencia" && (ta.estagio || ta.aceleradores.length > 0 || ta.freios.length > 0) && (
          <section className="dive-sec">
            <div className="dive-sec-label">
              <span className="dive-sec-num">{num()}</span> Onde estamos na curva
            </div>
            {ta.estagio && <p className="dive-stage">{ta.estagio}</p>}
            <div className="dive-forces">
              {ta.aceleradores.length > 0 && (
                <div className="dive-force">
                  <div className="dive-force-head accel">O que acelera</div>
                  <ul>
                    {ta.aceleradores.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
              {ta.freios.length > 0 && (
                <div className="dive-force">
                  <div className="dive-force-head brake">O que segura</div>
                  <ul>
                    {ta.freios.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        )}

        {ta?.kind === "gap" && (ta.porqueAberto || ta.cemiterio || ta.aPonte) && (
          <section className="dive-sec">
            <div className="dive-sec-label">
              <span className="dive-sec-num">{num()}</span> Por que o vão segue aberto
            </div>
            {ta.porqueAberto && <p className="dive-prose">{ta.porqueAberto}</p>}
            {ta.cemiterio && (
              <div className="dive-subsec">
                <div className="dive-subsec-label">Quem tentou</div>
                <p className="dive-prose">{ta.cemiterio}</p>
              </div>
            )}
            {ta.aPonte && (
              <div className="dive-subsec">
                <div className="dive-subsec-label">O que faria a ponte</div>
                <p className="dive-prose">{ta.aPonte}</p>
              </div>
            )}
          </section>
        )}

        {ta?.kind === "oportunidade" && (ta.beachhead || ta.menorTeste) && (
          <section className="dive-sec">
            <div className="dive-sec-label">
              <span className="dive-sec-num">{num()}</span> Por onde começar
            </div>
            {ta.beachhead && (
              <div className="dive-subsec">
                <div className="dive-subsec-label">O primeiro alvo (beachhead)</div>
                <p className="dive-prose">{ta.beachhead}</p>
              </div>
            )}
            {ta.menorTeste && (
              <div className="dive-subsec">
                <div className="dive-subsec-label">O menor teste</div>
                <p className="dive-prose">{ta.menorTeste}</p>
              </div>
            )}
          </section>
        )}

        {market && market.players.length > 0 && (
          <section className="dive-sec">
            <div className="dive-sec-label">
              <span className="dive-sec-num">{num()}</span> Quem já joga aqui
            </div>
            <div className="dive-players">
              {market.players.map((p, i) => {
                const body = (
                  <>
                    <span className="dive-player-head">
                      <span className="dive-player-name">{p.nome}</span>
                      <span className={`dive-player-rel ${p.relacao}`}>{p.relacao}</span>
                    </span>
                    <span className="dive-player-what">{p.oQueFaz}</span>
                    {p.url && <span className="dive-player-src">fonte ↗</span>}
                  </>
                );
                return p.url ? (
                  <a className="dive-player" key={i} href={p.url} target="_blank" rel="noopener noreferrer">
                    {body}
                  </a>
                ) : (
                  <div className="dive-player" key={i}>
                    {body}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {market?.ondeValor && (
          <section className="dive-sec">
            <div className="dive-sec-label">
              <span className="dive-sec-num">{num()}</span> Onde o valor se acumula
            </div>
            <p className="dive-prose">{market.ondeValor}</p>
          </section>
        )}

        {market && market.analogas.length > 0 && (
          <section className="dive-sec">
            <div className="dive-sec-label">
              <span className="dive-sec-num">{num()}</span> Jogadas análogas
            </div>
            <div className="dive-analogas">
              {market.analogas.map((a, i) => (
                <div className="dive-analoga" key={i}>
                  <span className="dive-analoga-name">{a.nome}</span>
                  <span className="dive-analoga-lesson">{a.licao}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* quando a busca não sustentou um mapa, é honesto dizer em vez de vazio */}
        {market &&
          market.players.length === 0 &&
          !market.ondeValor &&
          market.analogas.length === 0 && (
            <section className="dive-sec">
              <p className="dive-prose dive-empty-market">
                A busca não encontrou players ou movimentos claros ainda — cenário em aberto. Vale
                acompanhar os sinais abaixo e revisitar num próximo mergulho.
              </p>
            </section>
          )}

        {dive && dive.proximosPassos.length > 0 && (
          <section className="dive-sec">
            <div className="dive-sec-label">
              <span className="dive-sec-num">{num()}</span> Próximos passos
            </div>
            <div className="dive-steps">
              {dive.proximosPassos.map((p, i) => (
                <div className="dive-step" key={i}>
                  <span>{p}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {dive && dive.sinais.length > 0 && (
          <section className="dive-sec">
            <div className="dive-sec-label">
              <span className="dive-sec-num">{num()}</span> Sinais a observar
            </div>
            <div className="dive-signals">
              {dive.sinais.map((s, i) => (
                <div className="dive-signal" key={i}>
                  <span className={`dive-signal-tag ${s.kind}`}>
                    {s.kind === "risco" ? "Risco" : "A favor"}
                  </span>
                  <span>{s.text}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {idea.notes && (
          <section className="dive-sec">
            <div className="dive-sec-label">Sua nota</div>
            <p className="dive-note">{idea.notes}</p>
          </section>
        )}

        <div className="dive-actions">
          <span className="dive-actions-label">Exportar</span>
          <button className="dive-chip" onClick={copyMarkdown}>
            {copied ? "Copiado" : "Copiar como Markdown"}
          </button>
        </div>
      </div>
    </div>
  );
}
