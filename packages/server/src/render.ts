// Renderizador do boletim semanal: AssembledEdition -> HTML de email (inline
// styles, tabelas, dark theme). MÓDULO PURO — sem `server-only`, sem rede, sem
// banco — pra poder testar direto. A estrutura vem do mock ilustrativo em
// apps/web/public/boletim-exemplo.html (tarefa 73 v2), mas a paleta foi
// realinhada à do app (globals.css) e diverge do mock: header, intro, duas
// seções por ORIGEM (No Brasil / Na gringa), cada notícia com thumbnail opcional
// + setor + título + resumo (do RSS, opcional) + link, e cada seção fechando com
// os insights "O que isso conecta". Sem a tag de lag.

import type { AssembledEdition, Insight, NewsletterItem, NewsletterSection } from "@stalo/shared";

// --- paleta / tokens ---------------------------------------------------------
// Alinhados à identidade do app (apps/web/src/app/globals.css): mesma base azulada
// (--bg/--panel/--panel-alt), texto e âmbar. O boletim deve parecer "da mesma
// marca" que o radar — mais azul, menos preto. As cores derivadas (bordas, card
// de insight) saem dessa base pra harmonizar em client de email (só hex/inline).
const MONO = "'SF Mono',ui-monospace,Menlo,Consolas,monospace";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const AMBER = "#e8a23d";

const BG = "#0f1729"; // fundo externo (--bg do app)
const PANEL = "#16213a"; // container do boletim (--panel)
const PANEL_ALT = "#1c2a47"; // realce (--panel-alt) — topo do card do CTA
const BORDER = "#293a5c"; // borda visível, azulada (borda "levantada" sobre o panel)
const BORDER_SOFT = "#223154"; // divisória interna mais sutil
const CARD = "#101a30"; // card de insight recuado (mais escuro que o panel = "afunda")
const INK = "#eef2fb"; // títulos / texto forte
const BODY = "#c3cdde"; // corpo de leitura (intro, resumo)
const DIM = "#8b96ae"; // secundário (--text-dim)
const FAINT = "#6f7c94"; // rodapé

// cores por SETOR: cicladas por ordem de aparição, estáveis dentro da edição
// (o mesmo setor recebe sempre a mesma cor no boletim inteiro).
const TOPIC_PALETTE = ["#5ec8d8", "#63d29b", "#e8a23d", "#a68bff", "#ef6d7e"];
function makeTopicColorer(): (topic: string) => string {
  const map = new Map<string, string>();
  return (topic: string) => {
    const key = topic.trim().toLowerCase();
    let color = map.get(key);
    if (!color) {
      color = TOPIC_PALETTE[map.size % TOPIC_PALETTE.length];
      map.set(key, color);
    }
    return color;
  };
}

// type -> glifo/cor/rótulo do insight (glifos em Unicode pra renderizar no email)
const INSIGHT_META: Record<Insight["type"], { glyph: string; color: string; label: string }> = {
  tendencia: { glyph: "▲", color: "#63d29b", label: "TENDÊNCIA" },
  oportunidade: { glyph: "★", color: AMBER, label: "OPORTUNIDADE" },
  gap: { glyph: "◆", color: "#ef6d7e", label: "GAP" },
};

const SECTION_META: Record<NewsletterSection["origem"], { label: string; color: string; sub: string }> = {
  BR: { label: "No Brasil", color: "#63d29b", sub: "O que mexeu por aqui essa semana." },
  GRINGA: { label: "Na gringa", color: "#5ec8d8", sub: "O que já rola lá fora e ainda não chegou aqui." },
};

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

// --- helpers -----------------------------------------------------------------

// Escape de HTML no texto/atributos vindos do feed — evita quebrar o layout (ou
// injetar markup) com aspas, < > & de títulos/veículos.
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// "2026-07-06" -> "6 de julho de 2026" (parse manual pra não depender de fuso).
function formatWeek(weekStart: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(weekStart);
  if (!m) return "";
  const [, y, mo, d] = m;
  const mes = MESES[Number(mo) - 1] ?? "";
  return `${Number(d)} de ${mes} de ${y}`;
}

// ["IA","Fintech","Energia"] -> "IA, Fintech e Energia"
function formatSectors(sectors: string[]): string {
  const clean = sectors.map((s) => s.trim()).filter(Boolean).map(esc);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0];
  return `${clean.slice(0, -1).join(", ")} e ${clean[clean.length - 1]}`;
}

// --- blocos ------------------------------------------------------------------

function renderItem(
  item: NewsletterItem,
  origem: NewsletterSection["origem"],
  colorFor: (topic: string) => string,
): string {
  const color = colorFor(item.topic);
  // gringa ganha um marcador de "lá fora" (o mock usa bandeira; sem país no dado,
  // usamos o globo). BR não leva marcador.
  const prefix = origem === "GRINGA" ? "🌐 " : "";
  const sectorLine = `${prefix}● ${esc(item.topic)}`;

  // IMAGEM É OPCIONAL (regra dura): sem imageUrl não renderiza a célula da thumb
  // e o título ocupa a largura toda — a notícia NUNCA some por falta de imagem.
  const thumb = item.imageUrl
    ? `<td width="128" valign="top" style="width:128px;"><img src="${esc(item.imageUrl)}" width="112" height="84" alt="" style="display:block;width:112px;height:84px;border-radius:9px;object-fit:cover;border:1px solid ${BORDER};" /></td>`
    : "";

  // RESUMO É OPCIONAL: vem do description do RSS e dá volume à notícia (1–2 linhas
  // abaixo do título). Se vier vazio, a linha some sem quebrar o layout.
  const summary = item.summary && item.summary.trim()
    ? `<div style="font-size:14px;line-height:1.55;color:${BODY};margin-top:7px;">${esc(item.summary.trim())}</div>`
    : "";

  const link = item.url
    ? `<a href="${esc(item.url)}" style="font-family:${MONO};font-size:12px;color:${AMBER};text-decoration:none;">${esc(item.source)} · ↗</a>`
    : `<span style="font-family:${MONO};font-size:12px;color:${AMBER};">${esc(item.source)}</span>`;

  return `
            <tr><td style="padding:22px 34px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  ${thumb}
                  <td valign="top">
                    <div style="font-family:${MONO};font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:${color};">${sectorLine}</div>
                    <div style="font-size:17px;font-weight:600;line-height:1.4;color:${INK};margin-top:6px;">${esc(item.title)}</div>
                    ${summary}
                    <div style="margin-top:9px;">${link}</div>
                  </td>
                </tr>
              </table>
            </td></tr>`;
}

function renderInsights(insights: Insight[]): string {
  if (insights.length === 0) return ""; // seção sem insights: omite o bloco
  const rows = insights
    .map((ins, i) => {
      const meta = INSIGHT_META[ins.type];
      const mb = i < insights.length - 1 ? "margin-bottom:16px;" : "";
      const text = ins.description || ins.soWhat || ins.rationale || ins.title;
      return `
                <div style="${mb}">
                  <span style="color:${meta.color};font-size:13px;">${meta.glyph}</span>
                  <span style="font-size:12px;color:${meta.color};font-family:${MONO};letter-spacing:0.04em;">${meta.label}</span>
                  <div style="font-size:15px;color:${INK};line-height:1.5;margin-top:5px;">${esc(text)}</div>
                </div>`;
    })
    .join("");
  return `
            <tr><td style="padding:26px 34px 0;">
              <div style="background:${CARD};border:1px solid ${BORDER_SOFT};border-radius:14px;padding:20px 22px;">
                <div style="font-family:${MONO};font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${DIM};margin-bottom:14px;">O que isso conecta</div>${rows}
              </div>
            </td></tr>`;
}

function renderSection(
  section: NewsletterSection,
  colorFor: (topic: string) => string,
): string {
  // seção sem itens: omite a seção inteira (não faz sentido só o cabeçalho).
  if (section.items.length === 0) return "";
  const meta = SECTION_META[section.origem];
  const header = `
            <tr>
              <td style="padding:34px 34px 0;">
                <div style="border-top:1px solid ${BORDER_SOFT};padding-top:24px;">
                  <span style="font-family:${MONO};font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:${meta.color};">${meta.label}</span>
                  <div style="font-size:14px;color:${DIM};margin-top:6px;">${meta.sub}</div>
                </div>
              </td>
            </tr>`;
  const items = section.items.map((it) => renderItem(it, section.origem, colorFor)).join("");
  return header + items + renderInsights(section.insights);
}

// --- documento ---------------------------------------------------------------

export function renderBoletim(
  edition: AssembledEdition,
  opts: { email?: string; unsubscribeUrl?: string } = {},
): string {
  const colorFor = makeTopicColorer();
  const sections = edition.sections.map((s) => renderSection(s, colorFor)).join("");
  const dateStr = formatWeek(edition.weekStart);
  const sectorsStr = formatSectors(edition.sectors);
  // links relativos por ora (preview no próprio app); a etapa do ESP injeta URLs
  // absolutas + token de descadastro por assinante.
  const emailNote = opts.email
    ? `Enviado para <span style="color:${DIM};">${esc(opts.email)}</span>.<br />`
    : "";
  const footerSectors = sectorsStr
    ? `Você recebe porque assinou o boletim da Stalo com os setores <span style="color:${DIM};">${sectorsStr}</span>.<br />`
    : "";
  // link de descadastro: usa a URL por-assinante (com o id como token) quando o
  // envio a fornece; no preview/sem-URL mantém o placeholder "#".
  const unsubscribeHref = opts.unsubscribeUrl ? esc(opts.unsubscribeUrl) : "#";

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <title>Stalo — Boletim semanal</title>
  </head>
  <body style="margin:0;padding:0;background:${BG};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${BG};">
      O que mexeu essa semana nos seus setores, no Brasil e lá fora. E o que a gente tira disso.
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};">
      <tr>
        <td align="center" style="padding:32px 14px;">
          <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;background:${PANEL};border:1px solid ${BORDER};border-radius:18px;overflow:hidden;font-family:${SANS};">

            <!-- header -->
            <tr>
              <td style="padding:30px 34px 8px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="font-size:22px;font-weight:700;letter-spacing:-0.02em;color:${INK};">Stalo</td>
                    <td align="right" style="font-family:${MONO};font-size:11.5px;letter-spacing:0.12em;text-transform:uppercase;color:${AMBER};">Boletim semanal</td>
                  </tr>
                </table>
                <div style="font-family:${MONO};font-size:12px;letter-spacing:0.06em;color:${DIM};margin-top:8px;">${esc(dateStr)}</div>
              </td>
            </tr>

            <!-- intro editorial -->
            <tr>
              <td style="padding:20px 34px 4px;">
                <div style="font-size:17px;line-height:1.6;color:${BODY};">
                  Fechando a semana: o que de fato mexeu nos seus setores, no Brasil e lá fora. No fim de cada bloco, o que a gente tira disso.
                </div>
              </td>
            </tr>
${sections}
            <!-- CTA -->
            <tr>
              <td style="padding:36px 34px 8px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(180deg,${PANEL_ALT},${PANEL});border:1px solid ${BORDER};border-radius:16px;">
                  <tr>
                    <td style="padding:24px 26px;">
                      <div style="font-size:17px;font-weight:700;color:${INK};">Alguma dessas é a sua aposta?</div>
                      <div style="font-size:14.5px;line-height:1.55;color:${DIM};margin:7px 0 16px;">Escreva a tese e o radar devolve o veredito: quem já faz, onde está o gap e o go/no-go, com a fonte atrás de cada linha.</div>
                      <a href="/radar" style="display:inline-block;background:${AMBER};color:#1a1205;font-size:15px;font-weight:700;text-decoration:none;padding:13px 24px;border-radius:11px;">Gerar meu veredito →</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- footer -->
            <tr>
              <td style="padding:26px 34px 34px;">
                <div style="border-top:1px solid ${BORDER_SOFT};padding-top:20px;font-size:12.5px;line-height:1.6;color:${FAINT};">
                  ${emailNote}${footerSectors}
                  <a href="${unsubscribeHref}" style="color:${DIM};text-decoration:underline;">Descadastrar</a>
                  &nbsp;·&nbsp;
                  <a href="/preferencias" style="color:${DIM};text-decoration:underline;">Trocar setores</a>
                </div>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// Amostra ilustrativa da edição — 2 seções (BR/gringa), ~4 itens (1 SEM imageUrl,
// pra exercitar a regra dura) e 3 insights cada. Reutilizada pelo preview e pelo
// envio de teste, pra que os dois mostrem exatamente o mesmo boletim (DRY).
// Dados fictícios; não é feed real.
export function sampleEdition(): AssembledEdition {
  return {
    weekStart: "2026-07-06",
    sectors: ["Inteligência Artificial", "Fintech", "Energia"],
    sections: [
      {
        origem: "BR",
        items: [
          {
            id: "br1",
            topic: "Inteligência Artificial",
            title:
              "Bancos põem copilot pra rodar internamente e o regulador já pede rastro de auditoria.",
            summary:
              "Os copilots internos saíram do piloto e entraram em produção nas mesas. O Banco Central já sinaliza que vai exigir log de cada sugestão antes de liberar em escala.",
            source: "Valor Econômico",
            url: "https://example.com/ia-br",
            entities: [],
            publishedAt: "2026-07-08",
            imageUrl: "https://picsum.photos/seed/ia-br/208/156",
          },
          {
            // SEM imageUrl de propósito: precisa renderizar normalmente.
            id: "br2",
            topic: "Fintech",
            title: "Drex avança de fase e a liquidação de recebível on-chain deixa de ser teoria.",
            summary:
              "A nova etapa do piloto testou liquidar recebível tokenizado entre bancos. O que era prova de conceito começou a virar trilho de verdade.",
            source: "Brazil Journal",
            url: "https://example.com/fintech-br",
            entities: [],
            publishedAt: "2026-07-06",
          },
        ],
        insights: [
          {
            id: "br-i1",
            type: "tendencia",
            title: "Encanamento da nuvem",
            description:
              "O Brasil está montando o encanamento da nuvem: energia firme e rastro de auditoria são o mesmo movimento visto de dois ângulos.",
            rationale: "",
            whyNow: "",
            soWhat: "",
            related_items: [],
          },
          {
            id: "br-i2",
            type: "oportunidade",
            title: "Observabilidade de LLM",
            description:
              "Observabilidade de LLM pra banco regulado: a exigência de auditoria vira demanda antes de virar produto.",
            rationale: "",
            whyNow: "",
            soWhat: "",
            related_items: [],
          },
          {
            id: "br-i3",
            type: "gap",
            title: "Liquidação on-chain",
            description:
              "O Drex liga o trilho, mas ninguém conectou a liquidação on-chain ao recebível de saúde de verdade.",
            rationale: "",
            whyNow: "",
            soWhat: "",
            related_items: [],
          },
        ],
      },
      {
        origem: "GRINGA",
        items: [
          {
            id: "gr1",
            topic: "Inteligência Artificial",
            title:
              "Contexto longo virou commodity. A briga migrou pra memória que persiste entre sessões.",
            summary:
              "Com janelas de milhões de tokens já viradas commodity, a disputa mudou de terreno: o que o modelo lembra de você na semana seguinte virou o novo diferencial.",
            source: "The Information",
            url: "https://example.com/ia-gringa",
            entities: [],
            publishedAt: "2026-07-07",
            imageUrl: "https://picsum.photos/seed/ia-gr/208/156",
          },
          {
            id: "gr2",
            topic: "Fintech",
            title: "Stablecoin de tesouraria deixou a mesa de câmbio e virou produto de PME.",
            summary:
              "Fintechs passaram a oferecer conta em stablecoin com rendimento de tesouraria pra pequena empresa, um produto que até ano passado só existia pra mesa de câmbio.",
            source: "Bloomberg",
            url: "https://example.com/fintech-gringa",
            entities: [],
            publishedAt: "2026-07-03",
            imageUrl: "https://picsum.photos/seed/fin-gr/208/156",
          },
        ],
        insights: [
          {
            id: "gr-i1",
            type: "tendencia",
            title: "Valor sobe e desce a pilha",
            description:
              "O valor sobe e desce a pilha ao mesmo tempo: o que era diferencial no meio (contexto, câmbio) virou commodity; a margem foi pra memória e pra energia.",
            rationale: "",
            whyNow: "",
            soWhat: "",
            related_items: [],
          },
          {
            id: "gr-i2",
            type: "oportunidade",
            title: "Stablecoin pra PME",
            description:
              "Stablecoin de tesouraria pra PME brasileira: virou padrão lá fora, não tem versão local.",
            rationale: "",
            whyNow: "",
            soWhat: "",
            related_items: [],
          },
          {
            id: "gr-i3",
            type: "gap",
            title: "Energy-for-compute",
            description:
              "Contrato de energy-for-compute nasceu nos EUA; aqui ainda não há quem estruture o mesmo trato.",
            rationale: "",
            whyNow: "",
            soWhat: "",
            related_items: [],
          },
        ],
      },
    ],
  };
}
