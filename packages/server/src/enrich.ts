// Enriquecimento (best-effort, determinístico — sem LLM) dos itens de newsletter
// que vêm dos feeds Google News RSS. Esses feeds trazem:
//   (a) <link> apontando pro redirect news.google.com/rss/articles/{id};
//   (b) sem imagem (nenhum enclosure/media:*);
//   (c) description redundante (só título + veículo).
// A parte pura (título/summary/veículo) já é resolvida no map de rss.ts. Aqui
// resolvemos o que EXIGE rede: (1) a URL real do veículo por trás do redirect e
// (2) a og:image da página do artigo.
//
// REGRA DURA do repo: enriquecimento NUNCA descarta item. Qualquer falha de rede
// (timeout, status ruim, parse vazio) devolve null e o item segue intacto — só
// perde o "upgrade". Falhas são logadas com console.warn, como o ingest faz.
//
// SEM `import "server-only"` (igual rss.ts): este módulo entra na cadeia de
// import da ingestão, que é testada com vitest. A rede fica isolada nas funções
// (fetch injetável); os parsers são puros e testáveis com fixtures de string.

import type { NewsletterItem } from "@stalo/shared";

type FetchFn = typeof fetch;
type FetchInit = NonNullable<Parameters<FetchFn>[1]>;

// timeout curto por request: uma página lenta não pode segurar o lote inteiro.
const REQ_TIMEOUT_MS = 8_000;
// quantos itens enriquecer em paralelo (não martelar os hosts nem estourar fd).
const ENRICH_CONCURRENCY = 4;
// UA de browser: o Google News e vários veículos negam/variam a resposta pra
// clientes sem user-agent "de gente".
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const BATCHEXECUTE_URL = "https://news.google.com/_/DotsSplashUi/data/batchexecute";

// fetch com timeout via AbortController — sempre limpa o timer no finally.
async function fetchWithTimeout(url: string, init: FetchInit, fetchImpl: FetchFn): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQ_TIMEOUT_MS);
  try {
    return await fetchImpl(url, {
      ...init,
      signal: ctrl.signal,
      headers: { "user-agent": UA, ...(init.headers ?? {}) },
    });
  } finally {
    clearTimeout(timer);
  }
}

// ---------- parsers puros (sem rede — testáveis com fixtures de string) ----------

// id do artigo no path /rss/articles/{id}.
export function googleNewsArticleId(gnUrl: string): string | null {
  const m = /\/rss\/articles\/([^/?#]+)/.exec(gnUrl);
  return m ? m[1] : null;
}

// assinatura (data-n-a-sg) + timestamp (data-n-a-ts) do HTML da página do artigo GN.
export function parseSignature(html: string): { sg: string; ts: string } | null {
  const sg = /data-n-a-sg="([^"]+)"/.exec(html)?.[1];
  const ts = /data-n-a-ts="([^"]+)"/.exec(html)?.[1];
  if (!sg || !ts) return null;
  return { sg, ts };
}

// a URL real vem escapada dentro do JSON-em-JSON da resposta do batchexecute:
//   ...\"garturlres\",\"https://veiculo.com/...\"...
export function parseBatchExecuteUrl(body: string): string | null {
  const m = /\\"garturlres\\",\\"(https?:[^\\"]+)\\"/.exec(body);
  return m ? m[1] : null;
}

// og:image da página (aceita property= ou name=, e og:image ou og:image:url,
// com o content antes OU depois do atributo que identifica a meta).
export function parseOgImage(html: string): string | null {
  const patterns = [
    /<meta[^>]+(?:property|name)=["']og:image(?::url)?["'][^>]*\scontent=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*\s(?:property|name)=["']og:image(?::url)?["']/i,
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

// monta o body do batchexecute (receita validada ao vivo). O `inner` e o wrapper
// `f.req` seguem exatamente o formato que o endpoint espera. ATENÇÃO: endpoint
// interno e não-documentado do Google News — a receita pode expirar sem aviso;
// quando quebrar, tudo degrada pro fallback (mantém o link GN, sem imagem).
function buildBatchBody(id: string, ts: string, sg: string): string {
  const inner = JSON.stringify([
    "garturlreq",
    [
      ["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1],
      "X",
      "X",
      1,
      [1, 1, 1],
      1,
      1,
      null,
      0,
      0,
      null,
      0,
    ],
    id,
    Number(ts),
    sg,
  ]);
  const freq = JSON.stringify([[["Fbv4je", inner, null, "generic"]]]);
  return new URLSearchParams({ "f.req": freq }).toString();
}

// ---------- rede (best-effort — falha ⇒ null) ----------

// resolve o redirect news.google.com/rss/articles/{id} → URL real do veículo.
// Best-effort: qualquer falha (id ausente, status ruim, assinatura/URL não
// encontrada, timeout) devolve null e quem chama mantém o link GN.
export async function resolveGoogleNewsUrl(gnUrl: string, fetchImpl: FetchFn = fetch): Promise<string | null> {
  try {
    const id = googleNewsArticleId(gnUrl);
    if (!id) return null;

    // 1) GET da página do artigo → assinatura + timestamp.
    const pageRes = await fetchWithTimeout(gnUrl, {}, fetchImpl);
    if (!pageRes.ok) return null;
    const sig = parseSignature(await pageRes.text());
    if (!sig) return null;

    // 2) POST batchexecute com id/ts/sg → JSON escapado com a URL real.
    const beRes = await fetchWithTimeout(
      BATCHEXECUTE_URL,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: buildBatchBody(id, sig.ts, sig.sg),
      },
      fetchImpl,
    );
    if (!beRes.ok) return null;

    // 3) extrai a URL real da resposta.
    return parseBatchExecuteUrl(await beRes.text());
  } catch (err) {
    console.warn(`[enrich] resolveGoogleNewsUrl falhou (${gnUrl}): ${String(err)}`);
    return null;
  }
}

// busca a og:image da página do artigo. Falha ⇒ null (item fica sem imagem, o
// template já lida com isso).
export async function fetchOgImage(articleUrl: string, fetchImpl: FetchFn = fetch): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(articleUrl, {}, fetchImpl);
    if (!res.ok) return null;
    const img = parseOgImage(await res.text());
    if (!img) return null;
    // og:image pode vir relativa — resolve contra a URL do artigo.
    try {
      return new URL(img, articleUrl).toString();
    } catch {
      return img;
    }
  } catch (err) {
    console.warn(`[enrich] fetchOgImage falhou (${articleUrl}): ${String(err)}`);
    return null;
  }
}

// ---------- orquestração ----------

function isGoogleNewsUrl(url: string): boolean {
  try {
    return new URL(url).host.toLowerCase().endsWith("news.google.com");
  } catch {
    return false;
  }
}

function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// roda `fn` sobre `items` com no máx. `limit` em voo ao mesmo tempo, preservando
// a ordem dos resultados. Sem dependência externa.
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// dependências injetáveis pra testar sem rede.
export interface EnrichDeps {
  resolveUrl?: (gnUrl: string) => Promise<string | null>;
  fetchImage?: (articleUrl: string) => Promise<string | null>;
  concurrency?: number;
}

// enriquece o lote (≤12 itens do boletim): (1) resolve URL real dos itens que
// ainda apontam pro news.google.com; (2) pros itens SEM imagem e com URL real
// http(s) não-Google, tenta a og:image. NUNCA descarta item — no pior caso o
// item volta idêntico. Concorrência limitada.
export async function enrichItems(items: NewsletterItem[], deps: EnrichDeps = {}): Promise<NewsletterItem[]> {
  const resolveUrl = deps.resolveUrl ?? ((u: string) => resolveGoogleNewsUrl(u));
  const fetchImage = deps.fetchImage ?? ((u: string) => fetchOgImage(u));
  const concurrency = deps.concurrency ?? ENRICH_CONCURRENCY;

  // 1) URL real dos redirects do Google News.
  const withUrls = await mapLimit(items, concurrency, async (item) => {
    if (!isGoogleNewsUrl(item.url)) return item;
    const real = await resolveUrl(item.url);
    return real ? { ...item, url: real } : item;
  });

  // 2) og:image pros itens sem imagem, já com a URL real do veículo.
  return mapLimit(withUrls, concurrency, async (item) => {
    if (item.imageUrl) return item;
    if (!isHttpUrl(item.url) || isGoogleNewsUrl(item.url)) return item;
    const img = await fetchImage(item.url);
    return img ? { ...item, imageUrl: img } : item;
  });
}
