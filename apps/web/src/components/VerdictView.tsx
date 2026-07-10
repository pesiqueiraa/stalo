"use client";

import type { Verdict, VerdictCall, VerdictSource } from "@stalo/shared";
import { formatShortDate } from "@/lib/ui";

interface VerdictViewProps {
  verdict: Verdict;
  onSeeEvidence: () => void; // "ver a evidência no grafo" → troca pra view Rede
  // "exemplo ilustrativo": preocupação só-UI (não é do domínio Verdict). No
  // protótipo o veredito é sempre mock, então o default mostra o aviso; quando
  // o veredito real chegar, o chamador passa isExample={false}.
  isExample?: boolean;
}

// rótulo e cor do veredito. go/pivot/no-go reusam a paleta dos insights
// (mint/amber/coral), então o selo fala a mesma língua de cor do resto do radar.
const CALL_META: Record<VerdictCall, { label: string; hint: string }> = {
  go: { label: "Go", hint: "a tese se sustenta — vale construir" },
  pivot: { label: "Pivot", hint: "há algo real aqui, mas não do jeito que você propôs" },
  "no-go": { label: "No-go", hint: "a evidência não sustenta a tese" },
};

// A fonte é o produto: cada afirmação carrega o veículo, a data e o link. Este
// é o átomo reusado em todas as seções — "evidência que você pode checar".
function SourcePill({ src }: { src: VerdictSource }) {
  return (
    <a className="v-src" href={src.url} target="_blank" rel="noopener noreferrer">
      <span className="v-src-outlet">{src.veiculo}</span>
      <span className="v-src-says">{src.diz}</span>
      <span className="v-src-meta">
        {formatShortDate(src.data)} <span className="v-src-arrow">↗</span>
      </span>
    </a>
  );
}

export function VerdictView({ verdict: v, onSeeEvidence, isExample = true }: VerdictViewProps) {
  const call = CALL_META[v.call];

  return (
    <div className={`verdict verdict-${v.call}`}>
      {isExample && (
        <div className="v-example" role="note">
          <strong>Exemplo ilustrativo.</strong> No produto real, cada item abaixo vem de uma busca
          web ao vivo — aqui o veredito é montado no navegador para você ver o formato.
        </div>
      )}

      {/* cabeçalho: só a tese, estruturada — os conectores apagados, as duas
          partes que o founder escreve em destaque. A decisão (go/no-go/pivot)
          mora no fim, na seção 05, depois da evidência. */}
      <header className="v-seal">
        <span className="v-eyebrow">Veredito sobre a sua tese</span>
        <h2 className="v-thesis">
          <span className="v-thesis-con">Quero construir</span>{" "}
          <span className="v-thesis-key">{v.thesis.build}</span>{" "}
          <span className="v-thesis-con">para</span>{" "}
          <span className="v-thesis-key">{v.thesis.forWhom}</span>
          <span className="v-thesis-con">.</span>
        </h2>
      </header>

      <div className="v-sections">
        {/* (i) quem já faz — a seção que mata ou salva a ideia */}
        <section className="v-sec">
          <div className="v-sec-head">
            <span className="v-sec-num">01</span>
            <div>
              <h3>Quem já faz isso no Brasil</h3>
              <p className="v-sec-sub">Se alguém já resolve isso melhor que você faria, a tese morre aqui.</p>
            </div>
          </div>
          <div className="v-players">
            {v.players.map((p) => (
              <div className="v-player" key={p.nome}>
                <div className="v-player-top">
                  <span className="v-player-name">{p.nome}</span>
                  <span className={`v-rel v-rel-${p.relacao}`}>{p.relacao}</span>
                </div>
                <p className="v-player-what">{p.oQueFaz}</p>
                <SourcePill src={p.fonte} />
              </div>
            ))}
          </div>
        </section>

        {/* (ii) o que mudou em 90 dias — a vantagem de timing (notícia fresca) */}
        <section className="v-sec">
          <div className="v-sec-head">
            <span className="v-sec-num">02</span>
            <div>
              <h3>O que mudou nos últimos 90 dias</h3>
              <p className="v-sec-sub">O que um LLM genérico não sabe — e o que faz o timing ser agora.</p>
            </div>
          </div>
          <ol className="v-shifts">
            {v.shifts.map((s, i) => (
              <li className="v-shift" key={i}>
                <span className="v-shift-mark" aria-hidden="true" />
                <div>
                  <p className="v-shift-text">{s.texto}</p>
                  <SourcePill src={s.fonte} />
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* (iii) o gap específico + as fontes que o sustentam */}
        <section className="v-sec">
          <div className="v-sec-head">
            <span className="v-sec-num">03</span>
            <div>
              <h3>O gap específico</h3>
              <p className="v-sec-sub">Onde está o espaço que os outros deixaram aberto.</p>
            </div>
          </div>
          <p className="v-gap-text">{v.gap.texto}</p>
          <div className="v-gap-src">
            <span className="v-gap-src-label">Sustentado por</span>
            {v.gap.fontes.map((src, i) => (
              <SourcePill src={src} key={i} />
            ))}
          </div>
        </section>

        {/* (iv) o que mata a ideia — a ameaça */}
        <section className="v-sec v-sec-threat">
          <div className="v-sec-head">
            <span className="v-sec-num">04</span>
            <div>
              <h3>O que mata a ideia</h3>
              <p className="v-sec-sub">A ameaça que você precisa ter uma resposta antes de começar.</p>
            </div>
          </div>
          <p className="v-threat-text">{v.threat.texto}</p>
          <SourcePill src={v.threat.fonte} />
        </section>

        {/* (v) veredito completo: a resolução, com o pivot quando for o caso */}
        <section className="v-sec v-verdict-full">
          <div className="v-sec-head">
            <span className="v-sec-num">05</span>
            <div>
              <h3>Go / no-go / pivot</h3>
              <p className="v-sec-sub">A leitura, não o dado cru.</p>
            </div>
          </div>
          <div className="v-final">
            <div className="v-final-call">
              <span className="v-call-badge v-call-badge-lg">{call.label}</span>
              <span className="v-call-sub">{call.hint}</span>
            </div>
            <p className="v-final-rationale">{v.callRationale}</p>
          </div>
          {v.pivot && (
            <div className="v-pivot">
              <span className="v-pivot-label">O pivot</span>
              <p>{v.pivot}</p>
            </div>
          )}
        </section>
      </div>

      <footer className="v-foot">
        <button className="v-evidence-btn" onClick={onSeeEvidence}>
          Ver a evidência no grafo <span aria-hidden="true">→</span>
        </button>
        {v.discardedNoSource > 0 && (
          <p className="v-discarded">
            {v.discardedNoSource} {v.discardedNoSource === 1 ? "conexão foi descartada" : "conexões foram descartadas"} por
            não ter fonte checável. Conexão sem fonte não aparece.
          </p>
        )}
      </footer>
    </div>
  );
}
