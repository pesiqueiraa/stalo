// Renderizador do boletim semanal: AssembledEdition -> HTML de email (inline
// styles, tabelas, dark theme). MÓDULO PURO — sem `server-only`, sem rede, sem
// banco — pra poder testar direto. A "cara" espelha o mock ilustrativo em
// apps/web/public/boletim-exemplo.html (tarefa 73 v2): header, intro, duas
// seções por ORIGEM (No Brasil / Na gringa), cada notícia com thumbnail opcional
// + setor + título + link, e cada seção fechando com os insights "O que isso
// conecta". Sem a tag de lag.

import type { AssembledEdition, Insight, NewsletterItem, NewsletterSection } from "@stalo/shared";

// --- paleta / tokens (mesmos valores do mock) --------------------------------
const MONO = "'SF Mono',ui-monospace,Menlo,Consolas,monospace";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const AMBER = "#e8a23d";

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
  BR: { label: "No Brasil", color: "#63d29b", sub: "O que se moveu por aqui." },
  GRINGA: { label: "Na gringa", color: "#5ec8d8", sub: "O que já anda lá fora e ainda não chegou aqui." },
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
    ? `<td width="104" valign="top" style="width:104px;"><img src="${esc(item.imageUrl)}" width="92" height="69" alt="" style="display:block;width:92px;height:69px;border-radius:8px;object-fit:cover;border:1px solid #223049;" /></td>`
    : "";

  const link = item.url
    ? `<a href="${esc(item.url)}" style="font-family:${MONO};font-size:11px;color:${AMBER};text-decoration:none;">${esc(item.source)} · ↗</a>`
    : `<span style="font-family:${MONO};font-size:11px;color:${AMBER};">${esc(item.source)}</span>`;

  return `
            <tr><td style="padding:16px 30px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  ${thumb}
                  <td valign="top">
                    <div style="font-family:${MONO};font-size:10px;letter-spacing:0.06em;text-transform:uppercase;color:${color};">${sectorLine}</div>
                    <div style="font-size:14.5px;font-weight:600;line-height:1.35;color:#e9eefb;margin-top:5px;">${esc(item.title)}</div>
                    ${link}
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
      const mb = i < insights.length - 1 ? "margin-bottom:12px;" : "";
      const text = ins.description || ins.soWhat || ins.rationale || ins.title;
      return `
                <div style="${mb}">
                  <span style="color:${meta.color};font-size:12px;">${meta.glyph}</span>
                  <span style="font-size:11px;color:${meta.color};font-family:${MONO};letter-spacing:0.04em;">${meta.label}</span>
                  <div style="font-size:13.5px;color:#e9eefb;line-height:1.45;margin-top:3px;">${esc(text)}</div>
                </div>`;
    })
    .join("");
  return `
            <tr><td style="padding:22px 30px 0;">
              <div style="background:#0a0f1b;border:1px solid #1b2537;border-radius:12px;padding:16px 18px;">
                <div style="font-family:${MONO};font-size:10.5px;letter-spacing:0.1em;text-transform:uppercase;color:#7d8aa3;margin-bottom:12px;">O que isso conecta</div>${rows}
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
              <td style="padding:26px 30px 0;">
                <div style="border-top:1px solid #1b2537;padding-top:20px;">
                  <span style="font-family:${MONO};font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:${meta.color};">${meta.label}</span>
                  <div style="font-size:13px;color:#8a97ae;margin-top:5px;">${meta.sub}</div>
                </div>
              </td>
            </tr>`;
  const items = section.items.map((it) => renderItem(it, section.origem, colorFor)).join("");
  return header + items + renderInsights(section.insights);
}

// --- documento ---------------------------------------------------------------

export function renderBoletim(edition: AssembledEdition, opts: { email?: string } = {}): string {
  const colorFor = makeTopicColorer();
  const sections = edition.sections.map((s) => renderSection(s, colorFor)).join("");
  const dateStr = formatWeek(edition.weekStart);
  const sectorsStr = formatSectors(edition.sectors);
  // links relativos por ora (preview no próprio app); a etapa do ESP injeta URLs
  // absolutas + token de descadastro por assinante.
  const emailNote = opts.email
    ? `Enviado para <span style="color:#9aa7bd;">${esc(opts.email)}</span>.<br />`
    : "";
  const footerSectors = sectorsStr
    ? `Você recebe porque assinou o boletim da Stalo com os setores <span style="color:#9aa7bd;">${sectorsStr}</span>.<br />`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <title>Stalo — Boletim semanal</title>
  </head>
  <body style="margin:0;padding:0;background:#070b14;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#070b14;">
      No Brasil e lá fora — o que mexeu essa semana nos seus setores, e o que isso conecta.
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#070b14;">
      <tr>
        <td align="center" style="padding:28px 14px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#0d1220;border:1px solid #1b2537;border-radius:16px;overflow:hidden;font-family:${SANS};">

            <!-- header -->
            <tr>
              <td style="padding:26px 30px 6px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="font-size:19px;font-weight:700;letter-spacing:-0.02em;color:#f3f6fc;">Stalo</td>
                    <td align="right" style="font-family:${MONO};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${AMBER};">Boletim semanal</td>
                  </tr>
                </table>
                <div style="font-family:${MONO};font-size:11px;letter-spacing:0.06em;color:#7d8aa3;margin-top:6px;">${esc(dateStr)}</div>
              </td>
            </tr>

            <!-- intro editorial -->
            <tr>
              <td style="padding:16px 30px 4px;">
                <div style="font-size:15.5px;line-height:1.6;color:#c3cdde;">
                  O que mexeu essa semana nos seus setores — no Brasil e lá fora. Puxamos o fio e, no fim de cada bloco, o que a gente lê nisso.
                </div>
              </td>
            </tr>
${sections}
            <!-- CTA -->
            <tr>
              <td style="padding:28px 30px 6px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(180deg,#141a2b,#0d1220);border:1px solid #26324a;border-radius:14px;">
                  <tr>
                    <td style="padding:20px 22px;">
                      <div style="font-size:15px;font-weight:700;color:#f3f6fc;">Alguma dessas é a sua aposta?</div>
                      <div style="font-size:13px;line-height:1.5;color:#9aa7bd;margin:5px 0 14px;">Escreva a tese e o radar devolve o veredito: quem já faz, o gap e o go/no-go, com a fonte atrás de cada linha.</div>
                      <a href="/radar" style="display:inline-block;background:${AMBER};color:#1a1205;font-size:13.5px;font-weight:700;text-decoration:none;padding:11px 20px;border-radius:10px;">Gerar meu veredito →</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- footer -->
            <tr>
              <td style="padding:20px 30px 28px;">
                <div style="border-top:1px solid #1b2537;padding-top:16px;font-size:11.5px;line-height:1.6;color:#6f7c94;">
                  ${emailNote}${footerSectors}
                  <a href="#" style="color:#8b98af;text-decoration:underline;">Descadastrar</a>
                  &nbsp;·&nbsp;
                  <a href="/preferencias" style="color:#8b98af;text-decoration:underline;">Trocar setores</a>
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
