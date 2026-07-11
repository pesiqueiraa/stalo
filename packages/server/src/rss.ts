// Ingestão de RSS da newsletter — parsing DETERMINÍSTICO, sem LLM. Busca os
// feeds curados (feeds.ts) por (setor × origem), normaliza cada item para
// NewsletterItem e devolve um lote limpo (recência, dedupe, cap, ids locais)
// pronto para o Analista referenciar depois (mesmo padrão de ids do scan).
//
// SEM `import "server-only"` de propósito: o mapeamento é puro e testável com
// fixtures XML, como validate.ts. A rede fica isolada em parseFeed.

import Parser from "rss-parser";
import type { NewsletterItem } from "@stalo/shared";
import { feedsFor, type FeedSource, type FeedTipo, type Origem } from "./feeds";
import { enrichItems } from "./enrich";

// timeout por feed: um feed lento não pode segurar o lote inteiro.
const FEED_TIMEOUT_MS = 10_000;
// teto do lote por seção — o resto é ruído para uma newsletter.
export const MAX_NEWSLETTER_ITEMS = 12;
// teto POR FEED — impede que uma fonte de alto volume (ex.: feed geral) domine a
// seção e sufoque a diversidade de fontes.
export const PER_FEED_CAP = 4;
const MS_PER_DAY = 86_400_000;

// campos de imagem que o rss-parser não traz por padrão (namespace media:*).
interface MediaFields {
  "media:content"?: { $?: { url?: string } };
  "media:thumbnail"?: { $?: { url?: string } };
}
export type RssItem = Parser.Item & MediaFields;

export function createParser(): Parser<Record<string, never>, MediaFields> {
  return new Parser<Record<string, never>, MediaFields>({
    timeout: FEED_TIMEOUT_MS,
    customFields: { item: ["media:content", "media:thumbnail"] },
  });
}

// busca e faz o parse de UM feed. Pode rejeitar (rede/timeout/XML inválido) —
// quem chama (ingest) trata via Promise.allSettled e nunca deixa propagar.
export async function parseFeed(url: string): Promise<RssItem[]> {
  const feed = await createParser().parseURL(url);
  return feed.items;
}

// ---------- mapeamento puro (sem rede) ----------

// teto do resumo; e piso pra aceitar um corte em fim de frase (abaixo disso, um
// fim de frase encurtaria demais o resumo — melhor cortar em palavra com "…").
const SUMMARY_LIMIT = 300;
const MIN_SENTENCE = 140;

// reticências que o PRÓPRIO feed manda no fim ("...", "…", "[…]", "[...]", com
// espaços/colchetes) viram uma única "…". Só mexe no FIM da string.
function tidyEllipsis(text: string): string {
  return text.replace(/\s*(?:\[\s*(?:\.{2,}|…)\s*\]|\.{2,}|…)\s*$/u, "…");
}

// índice do ÚLTIMO fim de frase (. ! ? …) seguido de espaço/fim dentro de `s`;
// -1 se não houver. O "seguido de espaço/fim" evita cortar em "U.S." ou "3.5".
function lastSentenceEnd(s: string): number {
  let idx = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if ((c === "." || c === "!" || c === "?" || c === "…") && (s[i + 1] === undefined || s[i + 1] === " ")) {
      idx = i;
    }
  }
  return idx;
}

// tira tags HTML, colapsa espaços e resume com corte "limpo": frase completa que
// cabe fica inteira (sem "…"); se exceder o teto, corta no último fim de frase
// dentro do limite (se não encurtar demais) e, senão, no último espaço com "…".
export function stripHtml(raw: string): string {
  const text = tidyEllipsis(raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
  if (text.length <= SUMMARY_LIMIT) return text;

  const window = text.slice(0, SUMMARY_LIMIT);
  const end = lastSentenceEnd(window);
  if (end >= MIN_SENTENCE) {
    // fim de frase bom o bastante: resumo fecha numa frase completa, sem "…".
    return tidyEllipsis(window.slice(0, end + 1).trimEnd());
  }
  // sem fim de frase útil: corta no último espaço e sinaliza a continuação com "…".
  const lastSpace = window.lastIndexOf(" ");
  const cut = (lastSpace > 0 ? window.slice(0, lastSpace) : window).replace(/[\s.,;:!?…]+$/u, "");
  return `${cut}…`;
}

// url canônica: host em minúsculas, sem query nem hash, sem barra final. É a
// chave de dedupe e o link exibido. Se a url for inválida, devolve o original.
function canonicalUrl(raw: string): string {
  const trimmed = (raw ?? "").trim();
  try {
    const u = new URL(trimmed);
    u.hash = "";
    u.search = "";
    let s = `${u.protocol}//${u.host.toLowerCase()}${u.pathname}`;
    if (s.endsWith("/") && u.pathname !== "/") s = s.slice(0, -1);
    return s;
  } catch {
    return trimmed;
  }
}

// título normalizado para dedupe: minúsculas, sem pontuação, espaços colapsados.
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

// data ISO (YYYY-MM-DD) a partir de isoDate/pubDate; "" se não der pra parsear.
function toIsoDate(raw: RssItem): string {
  const src = raw.isoDate || raw.pubDate;
  if (!src) return "";
  const d = new Date(src);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

// imagem: enclosure > media:content > media:thumbnail; senão undefined. Imagem
// é enriquecimento — nunca filtra o item.
function extractImage(raw: RssItem): string | undefined {
  return (
    raw.enclosure?.url ||
    raw["media:content"]?.$?.url ||
    raw["media:thumbnail"]?.$?.url ||
    undefined
  );
}

// título do Google News vem com sufixo " - Veículo" (ex.: "Nubank cresce - Valor
// Econômico"). Separa no ÚLTIMO " - " pra não errar em títulos que têm " - " no
// meio. Devolve o título limpo e o veículo real (null se não houver sufixo).
export function parseGoogleNewsTitle(rawTitle: string): { title: string; source: string | null } {
  const title = rawTitle.trim();
  const idx = title.lastIndexOf(" - ");
  if (idx <= 0) return { title, source: null };
  const clean = title.slice(0, idx).trim();
  const source = title.slice(idx + 3).trim();
  // guarda: se um dos lados ficou vazio, não corta (título degenerado).
  if (!clean || !source) return { title, source: null };
  return { title: clean, source };
}

// um item cru → NewsletterItem SEM id (o id é atribuído no finalize, após dedupe
// e cap, para ficar estável na ordem final).
//
// Para feed google-news o RSS é "pobre": o título carrega o veículo no sufixo e
// a description só repete título+fonte. Então, para esse tipo: extrai o veículo
// real do sufixo (vira o `source`, no lugar de "Google News"), limpa o título e
// ZERA o summary redundante (summary vazio já renderiza ok no template). A URL de
// redirect e a imagem ausente são resolvidas depois, na etapa de enrich (rede).
function toNewsletterItem(
  raw: RssItem,
  setor: string,
  veiculo: string,
  tipo: FeedTipo,
): Omit<NewsletterItem, "id"> {
  const rawTitle = (raw.title ?? "").trim();
  let title = rawTitle;
  let source = veiculo;
  let summary = stripHtml(raw.contentSnippet || raw.content || "");

  if (tipo === "google-news") {
    const parsed = parseGoogleNewsTitle(rawTitle);
    title = parsed.title;
    if (parsed.source) source = parsed.source;
    summary = ""; // description do GN é só título+fonte repetidos → sem valor.
  }

  return {
    topic: setor,
    title,
    summary,
    source,
    url: canonicalUrl(raw.link ?? ""),
    entities: [],
    publishedAt: toIsoDate(raw),
    imageUrl: extractImage(raw),
  };
}

// recência (leniente): item sem data parseável é MANTIDO; só descarta o que tem
// data comprovadamente mais velha que a janela.
function isRecent(it: Omit<NewsletterItem, "id">, cutoff: number): boolean {
  if (!it.publishedAt) return true;
  const t = new Date(it.publishedAt).getTime();
  if (Number.isNaN(t)) return true;
  return t >= cutoff;
}

// ordena por data desc; item sem data vai pro fim.
function byDateDesc(a: Omit<NewsletterItem, "id">, b: Omit<NewsletterItem, "id">): number {
  if (!a.publishedAt && !b.publishedAt) return 0;
  if (!a.publishedAt) return 1;
  if (!b.publishedAt) return -1;
  return a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0;
}

// mapeia UM feed → itens, filtra recência, ordena desc e limita a `cap` — pra uma
// fonte de alto volume não dominar a seção. Puro (testável sem rede).
export function capFeedItems(
  rawItems: RssItem[],
  setor: string,
  veiculo: string,
  days: number,
  cap = PER_FEED_CAP,
  tipo: FeedTipo = "nativo",
): Omit<NewsletterItem, "id">[] {
  const cutoff = Date.now() - days * MS_PER_DAY;
  return rawItems
    .map((r) => toNewsletterItem(r, setor, veiculo, tipo))
    .filter((it) => isRecent(it, cutoff))
    .sort(byDateDesc)
    .slice(0, cap);
}

// recência → dedupe → ordena desc → cap global → ids. Puro, roda sobre itens de 1
// ou vários feeds já mapeados.
function finalize(items: Omit<NewsletterItem, "id">[], days: number): NewsletterItem[] {
  const cutoff = Date.now() - days * MS_PER_DAY;
  const recent = items.filter((it) => isRecent(it, cutoff));

  // DEDUPE: por url canônica e depois por título normalizado; mantém o 1º.
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const deduped: Omit<NewsletterItem, "id">[] = [];
  for (const it of recent) {
    const urlKey = it.url.trim();
    const titleKey = normalizeTitle(it.title);
    if (urlKey && seenUrls.has(urlKey)) continue;
    if (titleKey && seenTitles.has(titleKey)) continue;
    if (urlKey) seenUrls.add(urlKey);
    if (titleKey) seenTitles.add(titleKey);
    deduped.push(it);
  }

  // ordena por data desc, cap global e atribui ids r1..rN.
  deduped.sort(byDateDesc);
  return deduped
    .slice(0, MAX_NEWSLETTER_ITEMS)
    .map((it, i) => ({ ...it, id: `r${i + 1}` }));
}

// mapeamento puro de UM feed (map + recência/dedupe/cap/ids) — a unidade
// testável com fixture XML.
export function mapItems(
  rawItems: RssItem[],
  setor: string,
  veiculo: string,
  days: number,
  tipo: FeedTipo = "nativo",
): NewsletterItem[] {
  return finalize(rawItems.map((r) => toNewsletterItem(r, setor, veiculo, tipo)), days);
}

// ---------- ingestão (com rede) ----------

// núcleo compartilhado: busca uma lista de feeds em paralelo, mapeia cada item
// com o setor/veículo do SEU feed, e roda o finalize sobre o conjunto. Feed que
// falha (rejeitou/timeout) é PULADO com console.warn — nunca derruba o lote
// (fallback visível no log, regra do repo).
async function ingestFrom(sources: FeedSource[], days: number): Promise<NewsletterItem[]> {
  const settled = await Promise.allSettled(sources.map((f) => parseFeed(f.url)));

  const mapped: Omit<NewsletterItem, "id">[] = [];
  settled.forEach((res, i) => {
    const f = sources[i];
    if (res.status === "fulfilled") {
      // cap POR FEED antes de juntar: nenhuma fonte domina a seção.
      mapped.push(...capFeedItems(res.value, f.setor, f.veiculo, days, PER_FEED_CAP, f.tipo));
    } else {
      console.warn(`[rss] feed pulado (${f.veiculo} · ${f.url}): ${String(res.reason)}`);
    }
  });

  // enrich (rede) só sobre o lote FINAL (≤12 itens) — não sobre o cru: resolve o
  // link de redirect do Google News e busca og:image de quem está sem imagem.
  // Best-effort: item que não enriquece volta intacto (nunca é descartado).
  return enrichItems(finalize(mapped, days));
}

// coleta todos os feeds de UM (setor, origem) e devolve o lote limpo.
export async function ingest(setor: string, origem: Origem, days = 7): Promise<NewsletterItem[]> {
  return ingestFrom(feedsFor(setor, origem), days);
}

// une os feeds de VÁRIOS setores naquela origem num único lote (recência/dedupe/
// cap/ids atravessam todos os setores). Cada item mantém o setor do seu feed.
export async function ingestSectors(
  setores: string[],
  origem: Origem,
  days = 7,
): Promise<NewsletterItem[]> {
  return ingestFrom(
    setores.flatMap((s) => feedsFor(s, origem)),
    days,
  );
}
