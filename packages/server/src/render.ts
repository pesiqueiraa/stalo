// Renderizador do boletim semanal: AssembledEdition -> HTML de email (inline
// styles, tabelas, dark theme). MÓDULO PURO — sem `server-only`, sem rede, sem
// banco — pra poder testar direto.
//
// LAYOUT "capa editorial" (não feed vertical): container largo (720px), e cada
// seção por ORIGEM (No Brasil / Na gringa) abre com uma FAIXA de destaque (barra
// de cor + título grande + subtítulo). A 1ª notícia vira HERO (imagem em largura
// total + título grande + resumo), e as demais entram numa GRADE de 2 colunas de
// cards. A seção fecha com o card de insights "O que isso conecta". A paleta é a
// do app (globals.css). Compat de email: só tabelas aninhadas + estilo inline; a
// ÚNICA exceção é um <style> no <head> com uma media query pra empilhar a grade
// no mobile (class "col") — clients que ignoram <style> mostram 2 colunas.

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

// mistura FG sobre BG num hex sólido (alpha 0..1). Emails são inconsistentes com
// rgba() em background — então a gente PRÉ-mistura a tinta da seção com o PANEL e
// emite hex fechado. Puro/determinístico.
function mixHex(fg: string, bg: string, alpha: number): string {
  const rgb = (hex: string): [number, number, number] => {
    const h = hex.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  const [r1, g1, b1] = rgb(fg);
  const [r2, g2, b2] = rgb(bg);
  const ch = (a: number, b: number) => Math.round(a * alpha + b * (1 - alpha)).toString(16).padStart(2, "0");
  return `#${ch(r1, r2)}${ch(g1, g2)}${ch(b1, b2)}`;
}

// --- blocos ------------------------------------------------------------------

// eyebrow "● Setor" na cor do setor — reutilizado por hero e cards da grade.
function sectorTag(topic: string, color: string): string {
  return `<div style="font-family:${MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${color};">● ${esc(topic)}</div>`;
}

// fonte (veículo) como link quando há url; senão texto — a fonte é o "produto".
function sourceLink(item: NewsletterItem): string {
  return item.url
    ? `<a href="${esc(item.url)}" style="font-family:${MONO};font-size:12px;color:${AMBER};text-decoration:none;">${esc(item.source)} · ↗</a>`
    : `<span style="font-family:${MONO};font-size:12px;color:${AMBER};">${esc(item.source)}</span>`;
}

// RESUMO É OPCIONAL: vem do description do RSS. Vazio → devolve "" (sem quebrar).
function summaryBlock(item: NewsletterItem, size: number): string {
  return item.summary && item.summary.trim()
    ? `<div style="font-size:${size}px;line-height:1.55;color:${BODY};margin-top:8px;">${esc(item.summary.trim())}</div>`
    : "";
}

// faixa de abertura da seção: barra vertical de 5px na cor + título GRANDE +
// subtítulo, sobre um fundo levemente tingido (hex pré-misturado com o panel).
function renderSectionHeader(meta: { label: string; color: string; sub: string }): string {
  const tint = mixHex(meta.color, PANEL, 0.12);
  return `
            <tr><td style="padding:40px 36px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${tint};border-radius:12px;">
                <tr><td style="padding:20px 24px;border-left:5px solid ${meta.color};border-radius:12px;">
                  <div style="font-size:24px;font-weight:800;line-height:1.15;letter-spacing:-0.01em;color:${meta.color};">${meta.label}</div>
                  <div style="font-size:14.5px;line-height:1.5;color:${DIM};margin-top:7px;">${meta.sub}</div>
                </td></tr>
              </table>
            </td></tr>`;
}

// HERO: a 1ª notícia da seção. Com imagem → foto em largura total do conteúdo
// acima do texto. SEM imagem (regra dura: nunca some) → card de texto grande com
// uma barra de cor do setor no topo. object-fit:cover não pega em todo client
// (Outlook estica), mas é o melhor visual onde funciona.
function renderHero(item: NewsletterItem, colorFor: (topic: string) => string): string {
  const color = colorFor(item.topic);
  const textBlock = `${sectorTag(item.topic, color)}
                    <div style="font-size:22px;font-weight:700;line-height:1.28;color:${INK};margin-top:10px;">${esc(item.title)}</div>
                    ${summaryBlock(item, 15)}
                    <div style="margin-top:12px;">${sourceLink(item)}</div>`;

  if (item.imageUrl) {
    return `
            <tr><td style="padding:24px 36px 0;">
              <img src="${esc(item.imageUrl)}" width="648" height="300" alt="" style="display:block;width:100%;height:300px;object-fit:cover;border-radius:12px;border:1px solid ${BORDER_SOFT};" />
              <div style="padding-top:16px;">
                ${textBlock}
              </div>
            </td></tr>`;
  }
  return `
            <tr><td style="padding:24px 36px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CARD};border:1px solid ${BORDER_SOFT};border-radius:12px;">
                <tr><td style="height:5px;line-height:5px;font-size:0;background:${color};border-radius:12px 12px 0 0;">&nbsp;</td></tr>
                <tr><td style="padding:22px 24px;">
                    ${textBlock}
                </td></tr>
              </table>
            </td></tr>`;
}

// um card da grade (foto no topo, ou barra de cor se sem imagem; depois tag +
// título + fonte). Sem resumo aqui — a grade fica enxuta.
function renderGridCard(item: NewsletterItem, colorFor: (topic: string) => string): string {
  const color = colorFor(item.topic);
  const media = item.imageUrl
    ? `<img src="${esc(item.imageUrl)}" width="300" height="132" alt="" style="display:block;width:100%;height:132px;object-fit:cover;border-radius:10px 10px 0 0;" />`
    : `<div style="height:4px;line-height:4px;font-size:0;background:${color};border-radius:10px 10px 0 0;">&nbsp;</div>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CARD};border:1px solid ${BORDER_SOFT};border-radius:10px;">
                    <tr><td style="padding:0;">${media}</td></tr>
                    <tr><td style="padding:14px 16px 16px;">
                      ${sectorTag(item.topic, color)}
                      <div style="font-size:15.5px;font-weight:600;line-height:1.38;color:${INK};margin-top:8px;">${esc(item.title)}</div>
                      <div style="margin-top:10px;">${sourceLink(item)}</div>
                    </td></tr>
                  </table>`;
}

// GRADE 2 colunas das notícias não-hero. Duas células ~50% com gutter via padding.
// Nº ímpar: o último card fica sozinho, meia largura à esquerda (célula direita
// vazia). No mobile a media query (class "col") empilha as duas em 1 coluna.
function renderGrid(items: NewsletterItem[], colorFor: (topic: string) => string): string {
  if (items.length === 0) return "";
  let rows = "";
  for (let i = 0; i < items.length; i += 2) {
    const left = items[i];
    const right = items[i + 1];
    const leftCell = `<td class="col" width="50%" valign="top" style="padding:16px 8px 0 0;">${renderGridCard(left, colorFor)}</td>`;
    const rightCell = right
      ? `<td class="col" width="50%" valign="top" style="padding:16px 0 0 8px;">${renderGridCard(right, colorFor)}</td>`
      : `<td class="col" width="50%" valign="top" style="padding:16px 0 0 8px;"></td>`;
    rows += `
                <tr>${leftCell}${rightCell}</tr>`;
  }
  return `
            <tr><td style="padding:0 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}
              </table>
            </td></tr>`;
}

// card "O que isso conecta" fechando a seção. Cada insight ganha borda esquerda
// de 3px na cor do tipo (verde/âmbar/vermelho) + texto 15px.
function renderInsights(insights: Insight[]): string {
  if (insights.length === 0) return ""; // seção sem insights: omite o bloco
  const rows = insights
    .map((ins, i) => {
      const meta = INSIGHT_META[ins.type];
      const mb = i < insights.length - 1 ? "margin-bottom:18px;" : "";
      const text = ins.description || ins.soWhat || ins.rationale || ins.title;
      return `
                <div style="border-left:3px solid ${meta.color};padding-left:16px;${mb}">
                  <div style="font-family:${MONO};font-size:12px;letter-spacing:0.06em;color:${meta.color};">${meta.glyph} ${meta.label}</div>
                  <div style="font-size:15px;color:${INK};line-height:1.5;margin-top:6px;">${esc(text)}</div>
                </div>`;
    })
    .join("");
  return `
            <tr><td style="padding:28px 36px 0;">
              <div style="background:${CARD};border:1px solid ${BORDER_SOFT};border-radius:14px;padding:22px 24px;">
                <div style="font-family:${MONO};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${DIM};margin-bottom:18px;">O que isso conecta</div>${rows}
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
  const [hero, ...rest] = section.items;
  return (
    renderSectionHeader(meta) +
    renderHero(hero, colorFor) +
    renderGrid(rest, colorFor) +
    renderInsights(section.insights)
  );
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
    <style>
      /* ÚNICA regra não-inline: empilha a grade de 2 colunas no mobile. Clients
         que ignoram <style> (ex.: Gmail em alguns modos) seguem com 2 colunas —
         aceitável. */
      @media only screen and (max-width: 620px) {
        .container { width: 100% !important; }
        .col { display: block !important; width: 100% !important; padding: 0 0 16px 0 !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:${BG};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${BG};">
      O que mexeu essa semana nos seus setores, no Brasil e lá fora. E o que a gente tira disso.
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};">
      <tr>
        <td align="center" style="padding:32px 14px;">
          <table role="presentation" class="container" width="720" cellpadding="0" cellspacing="0" style="width:720px;max-width:100%;background:${PANEL};border:1px solid ${BORDER};border-radius:18px;overflow:hidden;font-family:${SANS};">

            <!-- header -->
            <tr>
              <td style="padding:32px 36px 8px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="font-size:23px;font-weight:700;letter-spacing:-0.02em;color:${INK};">Stalo</td>
                    <td align="right" style="font-family:${MONO};font-size:11.5px;letter-spacing:0.12em;text-transform:uppercase;color:${AMBER};">Boletim semanal</td>
                  </tr>
                </table>
                <div style="font-family:${MONO};font-size:12px;letter-spacing:0.06em;color:${DIM};margin-top:8px;">${esc(dateStr)}</div>
              </td>
            </tr>

            <!-- intro editorial -->
            <tr>
              <td style="padding:20px 36px 4px;">
                <div style="font-size:17.5px;line-height:1.6;color:${BODY};">
                  Fechando a semana: o que de fato mexeu nos seus setores, no Brasil e lá fora. No fim de cada bloco, o que a gente tira disso.
                </div>
              </td>
            </tr>
${sections}
            <!-- CTA -->
            <tr>
              <td style="padding:40px 36px 8px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(180deg,${PANEL_ALT},${PANEL});border:1px solid ${BORDER};border-radius:16px;">
                  <tr>
                    <td style="padding:26px 28px;">
                      <div style="font-size:18px;font-weight:700;color:${INK};">Alguma dessas é a sua aposta?</div>
                      <div style="font-size:14.5px;line-height:1.55;color:${DIM};margin:8px 0 18px;">Escreva a tese e o radar devolve o veredito: quem já faz, onde está o gap e o go/no-go, com a fonte atrás de cada linha.</div>
                      <a href="/radar" style="display:inline-block;background:${AMBER};color:#1a1205;font-size:15px;font-weight:700;text-decoration:none;padding:13px 24px;border-radius:11px;">Gerar meu veredito →</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- footer -->
            <tr>
              <td style="padding:28px 36px 36px;">
                <div style="border-top:1px solid ${BORDER_SOFT};padding-top:22px;font-size:12.5px;line-height:1.6;color:${FAINT};">
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

// Amostra ilustrativa da edição — 2 seções (BR/gringa), 5 itens cada (1 hero +
// 4 na grade), exercitando a regra dura em vários pontos: itens SEM imageUrl (o
// item nunca some) e itens SEM summary (a linha só não aparece). Reutilizada pelo
// preview e pelo envio de teste, pra que os dois mostrem exatamente o mesmo
// boletim (DRY). Dados fictícios; não é feed real.
export function sampleEdition(): AssembledEdition {
  return {
    weekStart: "2026-07-06",
    sectors: ["Inteligência Artificial", "Fintech", "Energia", "Semicondutores"],
    sections: [
      {
        origem: "BR",
        items: [
          {
            // HERO (com imagem + resumo).
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
            imageUrl: "https://picsum.photos/seed/ia-br/1296/600",
          },
          {
            // grade · SEM imageUrl de propósito (com resumo).
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
          {
            // grade · com imagem e resumo.
            id: "br3",
            topic: "Energia",
            title: "Leilão de transmissão bate recorde e destrava linhas paradas há anos.",
            summary:
              "Deságio recorde e novos entrantes: o leilão contratou mais quilômetro de linha do que os últimos três somados.",
            source: "epbr",
            url: "https://example.com/energia-br",
            entities: [],
            publishedAt: "2026-07-07",
            imageUrl: "https://picsum.photos/seed/energia-br/600/264",
          },
          {
            // grade · com imagem, SEM summary.
            id: "br4",
            topic: "Inteligência Artificial",
            title: "Startup brasileira de IA jurídica levanta rodada e mira os cartórios.",
            summary: "",
            source: "Pipeline",
            url: "https://example.com/ia2-br",
            entities: [],
            publishedAt: "2026-07-05",
            imageUrl: "https://picsum.photos/seed/ia2-br/600/264",
          },
          {
            // grade · SEM imagem e SEM summary (barra de cor no lugar da foto).
            id: "br5",
            topic: "Fintech",
            title: "Open finance engata e o primeiro crédito com dado compartilhado sai do papel.",
            summary: "",
            source: "Finsiders",
            url: "https://example.com/openfinance-br",
            entities: [],
            publishedAt: "2026-07-04",
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
            // HERO (com imagem + resumo).
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
            imageUrl: "https://picsum.photos/seed/ia-gr/1296/600",
          },
          {
            // grade · com imagem e resumo.
            id: "gr2",
            topic: "Fintech",
            title: "Stablecoin de tesouraria deixou a mesa de câmbio e virou produto de PME.",
            summary:
              "Fintechs passaram a oferecer conta em stablecoin com rendimento de tesouraria pra pequena empresa, um produto que até ano passado só existia pra mesa de câmbio.",
            source: "Bloomberg",
            url: "https://example.com/fintech-gringa",
            entities: [],
            publishedAt: "2026-07-03",
            imageUrl: "https://picsum.photos/seed/fin-gr/600/264",
          },
          {
            // grade · com imagem e resumo.
            id: "gr3",
            topic: "Energia",
            title: "Data center vira usina: gigantes fecham contrato de energia nuclear dedicada.",
            summary:
              "Contratos de longo prazo com pequenos reatores modulares saíram do anúncio e viraram compromisso firme de compra.",
            source: "Reuters",
            url: "https://example.com/energia-gringa",
            entities: [],
            publishedAt: "2026-07-06",
            imageUrl: "https://picsum.photos/seed/energia-gr/600/264",
          },
          {
            // grade · SEM imagem (com resumo).
            id: "gr4",
            topic: "Semicondutores",
            title: "Fundição de chip de IA fica sem capacidade e a fila de pedido passa de 2 anos.",
            summary:
              "A demanda por empacotamento avançado estourou o teto e virou o novo gargalo da cadeia.",
            source: "Nikkei",
            url: "https://example.com/semic-gringa",
            entities: [],
            publishedAt: "2026-07-04",
          },
          {
            // grade · com imagem, SEM summary.
            id: "gr5",
            topic: "Fintech",
            title: "Banco digital europeu compra corretora e vira o app de tudo.",
            summary: "",
            source: "Financial Times",
            url: "https://example.com/fintech2-gringa",
            entities: [],
            publishedAt: "2026-07-02",
            imageUrl: "https://picsum.photos/seed/fin2-gr/600/264",
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
