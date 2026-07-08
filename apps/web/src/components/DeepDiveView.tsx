"use client";

import { useCallback, useRef, useState } from "react";
import type { NewsItem, SavedIdea, Topic } from "@stalo/shared";
import { labelForType } from "@/lib/ui";
import { topicColor } from "@/lib/graph";
import { useDismiss } from "@/lib/useDismiss";

interface DeepDiveViewProps {
  idea: SavedIdea;
  topics: Topic[];
  financingId: string | null; // id com análise financeira em andamento
  onDeepenFinancials: (id: string) => void;
  onClose: () => void;
}

// monta o relatório em Markdown, para exportar (copiar) — texto puro, portável
function toMarkdown(idea: SavedIdea): string {
  const dive = idea.deepDive;
  const lines: string[] = [];
  lines.push(`# ${idea.title}`, "");
  lines.push(`_${labelForType(idea.type)} · ${idea.description}_`, "");
  if (dive?.panorama) lines.push(`## Panorama`, dive.panorama, "");
  if (idea.relatedItems.length) {
    lines.push(`## O que cruza`);
    idea.relatedItems.forEach((it) =>
      lines.push(`- **${it.topic}** — ${it.title}${it.source ? ` (${it.source})` : ""}`),
    );
    lines.push("");
  }
  if (idea.rationale) lines.push(`## Por que conecta`, idea.rationale, "");
  if (dive?.porQueAgora) lines.push(`## Por que agora`, dive.porQueAgora, "");
  if (idea.soWhat) lines.push(`## E daí?`, idea.soWhat, "");
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
  const f = idea.financials;
  if (f) {
    lines.push(`---`, "", `# Análise financeira`, "");
    lines.push(`## Mercado`, f.mercado, "");
    lines.push(`## Monetização`, f.monetizacao, "");
    if (f.premissas.length) {
      lines.push(`## O que precisa ser verdade`);
      f.premissas.forEach((p) => lines.push(`- ${p}`));
      lines.push("");
    }
    lines.push(`## Custo de validar`, f.custoValidar, "");
  }
  return lines.join("\n");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// monta o mesmo relatório em HTML — pra "Copiar para o Docs": o Google Docs
// (e o Word) interpretam text/html colado da área de transferência como texto
// rico, então colar aqui já chega formatado, sem exportação de arquivo.
function toHtml(idea: SavedIdea): string {
  const dive = idea.deepDive;
  const p = (text: string) => `<p>${escapeHtml(text)}</p>`;
  const h2 = (text: string) => `<h2>${escapeHtml(text)}</h2>`;
  const parts: string[] = [];
  parts.push(`<h1>${escapeHtml(idea.title)}</h1>`);
  parts.push(`<p><em>${escapeHtml(labelForType(idea.type))} · ${escapeHtml(idea.description)}</em></p>`);
  if (dive?.panorama) parts.push(h2("Panorama"), p(dive.panorama));
  if (idea.relatedItems.length) {
    parts.push(h2("O que cruza"));
    parts.push(
      "<ul>" +
        idea.relatedItems
          .map(
            (it) =>
              `<li><strong>${escapeHtml(it.topic)}</strong> — ${escapeHtml(it.title)}${
                it.source ? ` (${escapeHtml(it.source)})` : ""
              }</li>`,
          )
          .join("") +
        "</ul>",
    );
  }
  if (idea.rationale) parts.push(h2("Por que conecta"), p(idea.rationale));
  if (dive?.porQueAgora) parts.push(h2("Por que agora"), p(dive.porQueAgora));
  if (idea.soWhat) parts.push(h2("E daí?"), p(idea.soWhat));
  if (dive?.proximosPassos.length) {
    parts.push(h2("Próximos passos"));
    parts.push("<ol>" + dive.proximosPassos.map((s) => `<li>${escapeHtml(s)}</li>`).join("") + "</ol>");
  }
  if (dive?.sinais.length) {
    parts.push(h2("Sinais a observar"));
    parts.push(
      "<ul>" +
        dive.sinais
          .map((s) => `<li><strong>${s.kind === "risco" ? "Risco" : "A favor"}:</strong> ${escapeHtml(s.text)}</li>`)
          .join("") +
        "</ul>",
    );
  }
  if (idea.notes) parts.push(h2("Sua nota"), p(idea.notes));
  const f = idea.financials;
  if (f) {
    parts.push("<hr/>", "<h1>Análise financeira</h1>");
    parts.push(h2("Mercado"), p(f.mercado));
    parts.push(h2("Monetização"), p(f.monetizacao));
    if (f.premissas.length) {
      parts.push(h2("O que precisa ser verdade"));
      parts.push("<ul>" + f.premissas.map((pr) => `<li>${escapeHtml(pr)}</li>`).join("") + "</ul>");
    }
    parts.push(h2("Custo de validar"), p(f.custoValidar));
  }
  return parts.join("\n");
}

export function DeepDiveView({
  idea,
  topics,
  financingId,
  onDeepenFinancials,
  onClose,
}: DeepDiveViewProps) {
  const [copied, setCopied] = useState(false);
  const [docsCopied, setDocsCopied] = useState(false);
  const [closing, setClosing] = useState(false);
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
  const fin = idea.financials;
  const financing = financingId === idea.id;
  const topicNames = topics.map((t) => t.name);

  // agrupa as notícias por setor para a seção "O que cruza"
  const groups = new Map<string, NewsItem[]>();
  idea.relatedItems.forEach((it) => {
    const arr = groups.get(it.topic) ?? [];
    arr.push(it);
    groups.set(it.topic, arr);
  });
  const sectors = [...groups.keys()];

  function copyMarkdown() {
    navigator.clipboard?.writeText(toMarkdown(idea)).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => setCopied(false),
    );
  }

  // Copia como texto rico (text/html), com fallback pro texto plano — colar
  // num Google Doc (ou Word) já chega formatado, sem precisar de exportação
  // de arquivo nem integração com a API do Docs.
  function copyForDocs() {
    const html = toHtml(idea);
    const text = toMarkdown(idea);
    const onDone = () => {
      setDocsCopied(true);
      setTimeout(() => setDocsCopied(false), 2000);
    };
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      const item = new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([text], { type: "text/plain" }),
      });
      navigator.clipboard.write([item]).then(onDone, () => {
        navigator.clipboard?.writeText(text).then(onDone, () => setDocsCopied(false));
      });
    } else {
      navigator.clipboard?.writeText(text).then(onDone, () => setDocsCopied(false));
    }
  }

  // Sem lib de PDF: usa o diálogo nativo de impressão do navegador ("Salvar
  // como PDF"), com CSS de impressão dedicado (globals.css) que isola só a
  // folha do mergulho. Portável, sem dependência nova, sem key/servidor.
  function downloadPdf() {
    window.print();
  }

  let secNum = 0;
  const num = () => String(++secNum).padStart(2, "0");

  return (
    <div
      className={`dive-overlay${closing ? " closing" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Mergulho na ideia"
    >
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
          <span className="dive-eyebrow">Mergulhar · deep dive</span>
          <button className="dive-back" onClick={requestClose}>
            ← voltar ao radar
          </button>
        </div>

        <span className={`detail-type detail-${idea.type}`}>{labelForType(idea.type)}</span>
        <h1 className="dive-title">{idea.title}</h1>
        <p className="dive-punch dive-punch--divider">{idea.description}</p>

        {dive?.panorama && (
          <section className="dive-sec">
            <div className="dive-sec-label">
              <span className="dive-sec-num">{num()}</span> Panorama
            </div>
            <p className="dive-prose">{dive.panorama}</p>
          </section>
        )}

        {sectors.length > 0 && (
          <section className="dive-sec">
            <div className="dive-sec-label">
              <span className="dive-sec-num">{num()}</span> O que cruza
            </div>
            <div className="dive-cross">
              {sectors.map((sector) => (
                <div className="dive-cross-group" key={sector}>
                  <div className="dive-cross-head">
                    <span
                      className="reason-dot"
                      style={{ background: topicColor(sector, topicNames) }}
                    />
                    {sector}
                  </div>
                  {groups.get(sector)!.map((it) =>
                    it.url ? (
                      <a className="dive-ev" key={it.id} href={it.url} target="_blank" rel="noopener noreferrer">
                        <span className="dive-ev-title">{it.title}</span>
                        <span className="dive-ev-meta">{it.source || "fonte"} ↗</span>
                      </a>
                    ) : (
                      <div className="dive-ev" key={it.id}>
                        <span className="dive-ev-title">{it.title}</span>
                        {it.source && <span className="dive-ev-meta">{it.source}</span>}
                      </div>
                    ),
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {idea.rationale && (
          <section className="dive-sec">
            <div className="dive-sec-label">
              <span className="dive-sec-num">{num()}</span> Por que conecta
            </div>
            <p className="dive-prose">{idea.rationale}</p>
          </section>
        )}

        {dive?.porQueAgora && (
          <section className="dive-sec">
            <div className="dive-sec-label">
              <span className="dive-sec-num">{num()}</span> Por que agora
            </div>
            <p className="dive-prose">{dive.porQueAgora}</p>
          </section>
        )}

        {idea.soWhat && (
          <section className="dive-sec dive-payoff">
            <div className="dive-sec-label">E daí?</div>
            <p>{idea.soWhat}</p>
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

        {/* segundo nível: análise financeira (sob demanda) */}
        {fin ? (
          <div className="dive-fin">
            <div className="dive-fin-head">Análise financeira</div>
            <section className="dive-sec">
              <div className="dive-sec-label">
                <span className="dive-sec-num">{num()}</span> Mercado
              </div>
              <p className="dive-prose">{fin.mercado}</p>
            </section>
            <section className="dive-sec">
              <div className="dive-sec-label">
                <span className="dive-sec-num">{num()}</span> Monetização
              </div>
              <p className="dive-prose">{fin.monetizacao}</p>
            </section>
            {fin.premissas.length > 0 && (
              <section className="dive-sec">
                <div className="dive-sec-label">
                  <span className="dive-sec-num">{num()}</span> O que precisa ser verdade
                </div>
                <ul className="dive-premissas">
                  {fin.premissas.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </section>
            )}
            <section className="dive-sec">
              <div className="dive-sec-label">
                <span className="dive-sec-num">{num()}</span> Custo de validar
              </div>
              <p className="dive-prose">{fin.custoValidar}</p>
            </section>
          </div>
        ) : (
          <div className="dive-deepen">
            <div className="dive-deepen-text">
              <div className="dive-deepen-title">Aprofundar: análise financeira</div>
              <div className="dive-deepen-sub">
                mercado · monetização · o que precisa ser verdade · custo de validar
              </div>
            </div>
            <button
              className="dive-deepen-btn"
              onClick={() => onDeepenFinancials(idea.id)}
              disabled={financing}
            >
              {financing ? (
                <>
                  <span className="spinner" /> Analisando…
                </>
              ) : (
                "Aprofundar"
              )}
            </button>
          </div>
        )}

        <div className="dive-actions">
          <span className="dive-actions-label">Exportar</span>
          <button className="dive-chip" onClick={copyMarkdown}>
            {copied ? "Copiado" : "Copiar como Markdown"}
          </button>
          <button className="dive-chip" onClick={copyForDocs}>
            {docsCopied ? "Copiado" : "Copiar para o Docs"}
          </button>
          <button className="dive-chip" onClick={downloadPdf}>
            Baixar PDF
          </button>
        </div>
      </div>
    </div>
  );
}
