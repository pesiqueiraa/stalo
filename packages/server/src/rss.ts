// Ingestão de RSS da newsletter — parsing DETERMINÍSTICO, sem LLM. Busca os
// feeds curados (feeds.ts) por (setor × origem), normaliza cada item para
// NewsletterItem e devolve um lote limpo (recência, dedupe, cap, ids locais)
// pronto para o Analista referenciar depois (mesmo padrão de ids do scan).
//
// SEM `import "server-only"` de propósito: o mapeamento é puro e testável com
// fixtures XML, como validate.ts. A rede fica isolada em parseFeed.

import Parser from "rss-parser";
import type { NewsletterItem } from "@stalo/shared";
import { feedsFor, type FeedSource, type Origem } from "./feeds";

// timeout por feed: um feed lento não pode segurar o lote inteiro.
const FEED_TIMEOUT_MS = 10_000;
// teto do lote por seção — o resto é ruído para uma newsletter.
export const MAX_NEWSLETTER_ITEMS = 12;
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

// tira tags HTML, colapsa espaços e trunca ~300 chars.
function stripHtml(raw: string): string {
  const text = raw
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 300 ? `${text.slice(0, 300).trimEnd()}…` : text;
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

// um item cru → NewsletterItem SEM id (o id é atribuído no finalize, após dedupe
// e cap, para ficar estável na ordem final).
function toNewsletterItem(raw: RssItem, setor: string, veiculo: string): Omit<NewsletterItem, "id"> {
  return {
    topic: setor,
    title: (raw.title ?? "").trim(),
    summary: stripHtml(raw.contentSnippet || raw.content || ""),
    source: veiculo,
    url: canonicalUrl(raw.link ?? ""),
    entities: [],
    publishedAt: toIsoDate(raw),
    imageUrl: extractImage(raw),
  };
}

// recência → dedupe → ordena desc → cap → ids. Puro, roda sobre itens de 1 ou
// vários feeds já mapeados.
function finalize(items: Omit<NewsletterItem, "id">[], days: number): NewsletterItem[] {
  const cutoff = Date.now() - days * MS_PER_DAY;

  // RECÊNCIA (leniente): item sem data parseável é MANTIDO; só descarta o que
  // tem data comprovadamente mais velha que a janela.
  const recent = items.filter((it) => {
    if (!it.publishedAt) return true;
    const t = new Date(it.publishedAt).getTime();
    if (Number.isNaN(t)) return true;
    return t >= cutoff;
  });

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

  // ordena por data desc (sem data vai pro fim), cap e atribui ids r1..rN.
  deduped.sort((a, b) => {
    if (!a.publishedAt && !b.publishedAt) return 0;
    if (!a.publishedAt) return 1;
    if (!b.publishedAt) return -1;
    return a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0;
  });
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
): NewsletterItem[] {
  return finalize(rawItems.map((r) => toNewsletterItem(r, setor, veiculo)), days);
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
      for (const raw of res.value) mapped.push(toNewsletterItem(raw, f.setor, f.veiculo));
    } else {
      console.warn(`[rss] feed pulado (${f.veiculo} · ${f.url}): ${String(res.reason)}`);
    }
  });

  return finalize(mapped, days);
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
