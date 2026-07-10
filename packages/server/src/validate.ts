import type {
  GringaItem,
  GringaLag,
  Insight,
  NewsItem,
  ScanResult,
  Verdict,
  VerdictCall,
  VerdictPlayer,
  VerdictShift,
  VerdictSource,
} from "@stalo/shared";

// Validação/limpeza do ScanResult — lógica PURA (sem IA, sem rede), separada de
// scan.ts pra ser testável sem instanciar o cliente OpenAI. Blinda a saída do
// LLM antes de virar grafo: dedup, limites e descarte de insights órfãos.

// Byte nulo (0x00): o Postgres rejeita esse caractere em colunas de texto e a
// saída do LLM/busca web às vezes o traz — removido antes de gravar.
const NUL = String.fromCharCode(0);

export const MAX_ITEMS = 15;
export const MAX_INSIGHTS = 5;

export const stripNul = (s: string): string =>
  typeof s === "string" ? s.split(NUL).join("") : s;

// Remove citações em markdown que o modelo (gpt-5.4-mini + web_search) cola na
// prosa — ex.: "release. ([docs.aws.amazon.com](https://...))". Como a UI mostra
// texto puro, elas apareceriam cruas. As fontes têm lugar próprio (players[].url).
export function stripCitations(s: string): string {
  if (typeof s !== "string") return s;
  return s
    .replace(/\s*\(\[[^\]]*\]\([^)]*\)\)/g, "") // ([rótulo](url)) — o padrão emitido
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // [rótulo](url) solto → só o rótulo
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function validateAndClean(items: NewsItem[], insights: Insight[]): ScanResult {
  // dedup de notícias por url e por título (case-insensitive); mantém a 1ª.
  // as strings já saem sanitizadas (sem byte nulo) daqui.
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const cleanItems: NewsItem[] = [];
  for (const raw of items) {
    const it: NewsItem = {
      id: raw.id,
      topic: stripNul(raw.topic),
      title: stripNul(raw.title),
      summary: stripNul(raw.summary),
      source: stripNul(raw.source),
      url: stripNul(raw.url),
      entities: (raw.entities ?? []).map(stripNul),
      publishedAt: stripNul(raw.publishedAt),
    };
    const url = it.url.trim();
    const titleKey = it.title.trim().toLowerCase();
    if (url && seenUrls.has(url)) continue;
    if (titleKey && seenTitles.has(titleKey)) continue;
    if (url) seenUrls.add(url);
    if (titleKey) seenTitles.add(titleKey);
    cleanItems.push(it);
    if (cleanItems.length >= MAX_ITEMS) break;
  }

  const itemIds = new Set(cleanItems.map((i) => i.id));
  const cleanInsights: Insight[] = [];
  for (const ins of insights) {
    // só ids de notícias que sobreviveram; o cruzamento exige >= 2 (regra do produto)
    const related = (ins.related_items ?? []).filter((id) => itemIds.has(id));
    if (related.length < 2) continue;
    const title = stripNul(ins.title).trim();
    if (!title) continue;
    cleanInsights.push({
      ...ins,
      title,
      description: stripNul(ins.description),
      rationale: stripNul(ins.rationale ?? ""),
      whyNow: stripNul(ins.whyNow ?? ""),
      soWhat: stripNul(ins.soWhat ?? ""),
      related_items: related,
    });
    if (cleanInsights.length >= MAX_INSIGHTS) break;
  }

  return { items: cleanItems, insights: cleanInsights };
}

export function isValidScanResult(value: unknown): value is ScanResult {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.items) && Array.isArray(v.insights);
}

// ---------- Veredito ----------
// Validação/limpeza PURA do veredito (mesmo espírito de validateAndClean, sem
// IA/rede). A regra dura do produto — "conexão sem fonte não aparece" — é
// aplicada AQUI, em código: cada afirmação com `url` vazia é descartada e
// CONTADA em discardedNoSource (honestidade, não invenção da IA). Fontes
// repetidas (mesma url) são deduplicadas, mas NÃO contam como descarte (têm
// fonte, só repetida). A `url` nunca passa por stripCitations — ela é a fonte.

// Limites por seção: um parecer é curto e cirúrgico. Poucos players/shifts bem
// escolhidos > uma lista longa (o valor é o recorte, não a cobertura).
export const MAX_VERDICT_PLAYERS = 4;
export const MAX_VERDICT_SHIFTS = 3;
export const MAX_VERDICT_GAP_SOURCES = 3;

// prosa do veredito: sem byte nulo e sem citação markdown crua (como o scan).
const cleanText = (s: string): string => stripCitations(stripNul(s ?? ""));

// limpa uma fonte; a url só perde byte nulo/espaço (nunca stripCitations, senão
// o link — que É a fonte — seria mutilado).
function cleanSource(src: VerdictSource | undefined): VerdictSource {
  return {
    veiculo: cleanText(src?.veiculo ?? ""),
    diz: cleanText(src?.diz ?? ""),
    url: stripNul(src?.url ?? "").trim(),
    data: stripNul(src?.data ?? "").trim(),
  };
}

// material bruto do parecerista, antes da validação em código.
export interface RawVerdict {
  players: { nome: string; oQueFaz: string; relacao: "direto" | "adjacente"; fonte: VerdictSource }[];
  shifts: { texto: string; fonte: VerdictSource }[];
  gap: { texto: string; fontes: VerdictSource[] };
  threat: { texto: string; fonte: VerdictSource };
  call: VerdictCall;
  callRationale: string;
  pivot: string | null;
}

const EMPTY_SOURCE: VerdictSource = { veiculo: "", diz: "", url: "", data: "" };

export function validateVerdict(
  thesis: { build: string; forWhom: string },
  sectors: string[],
  raw: RawVerdict,
): Verdict {
  const seenUrls = new Set<string>();
  let discardedNoSource = 0;

  // classifica uma fonte de uma conexão "substantiva" (que a IA de fato
  // considerou): com url → mantém (dedup pela 1ª); sem url → descarta e conta;
  // url repetida → dedup silencioso (não conta). `substantive:false` = ruído,
  // nem entra na conta.
  function takeSource(src: VerdictSource, substantive: boolean): VerdictSource | null {
    const s = cleanSource(src);
    if (!substantive) return null;
    if (!s.url) {
      discardedNoSource++;
      return null;
    }
    if (seenUrls.has(s.url)) return null;
    seenUrls.add(s.url);
    return s;
  }

  const players: VerdictPlayer[] = [];
  for (const p of raw.players ?? []) {
    const nome = cleanText(p.nome);
    const fonte = takeSource(p.fonte, nome.length > 0);
    if (!nome || !fonte) continue;
    players.push({ nome, oQueFaz: cleanText(p.oQueFaz), relacao: p.relacao, fonte });
    if (players.length >= MAX_VERDICT_PLAYERS) break;
  }

  const shifts: VerdictShift[] = [];
  for (const sh of raw.shifts ?? []) {
    const texto = cleanText(sh.texto);
    const fonte = takeSource(sh.fonte, texto.length > 0);
    if (!texto || !fonte) continue;
    shifts.push({ texto, fonte });
    if (shifts.length >= MAX_VERDICT_SHIFTS) break;
  }

  const gapFontes: VerdictSource[] = [];
  for (const src of raw.gap?.fontes ?? []) {
    const cleaned = cleanSource(src);
    const substantive = cleaned.veiculo.length > 0 || cleaned.diz.length > 0 || cleaned.url.length > 0;
    const fonte = takeSource(src, substantive);
    if (!fonte) continue;
    gapFontes.push(fonte);
    if (gapFontes.length >= MAX_VERDICT_GAP_SOURCES) break;
  }

  // ameaça é singular (não deduplica: é o ápice do parecer). Se veio uma ameaça
  // real mas sem url, ela some (regra dura) e conta como descarte.
  const threatTexto = cleanText(raw.threat?.texto ?? "");
  const threatSrc = cleanSource(raw.threat?.fonte);
  let threat: Verdict["threat"];
  if (threatTexto && threatSrc.url) {
    threat = { texto: threatTexto, fonte: threatSrc };
  } else {
    if (threatTexto && !threatSrc.url) discardedNoSource++;
    threat = { texto: "", fonte: { ...EMPTY_SOURCE } };
  }

  // pivot só faz sentido quando a decisão é "pivot".
  const call = raw.call;
  const pivotText = cleanText(raw.pivot ?? "");
  const pivot = call === "pivot" ? pivotText || null : null;

  return {
    thesis: { build: cleanText(thesis.build), forWhom: cleanText(thesis.forWhom) },
    sectors: (sectors ?? []).map((s) => stripNul(s).trim()).filter(Boolean),
    players,
    shifts,
    gap: { texto: cleanText(raw.gap?.texto ?? ""), fontes: gapFontes },
    threat,
    call,
    callRationale: cleanText(raw.callRationale ?? ""),
    pivot,
    discardedNoSource,
  };
}

// um veredito só é "mostrável" se tem decisão válida, um gap escrito e ao menos
// uma seção com fonte (senão, é ruído sem evidência — a rota mostra fallback).
export function isValidVerdict(value: unknown): value is Verdict {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const callOk = v.call === "go" || v.call === "no-go" || v.call === "pivot";
  const gap = v.gap as { texto?: unknown; fontes?: unknown } | undefined;
  const players = v.players as unknown[] | undefined;
  const shifts = v.shifts as unknown[] | undefined;
  const gapFontes = gap?.fontes as unknown[] | undefined;
  const hasSource =
    (Array.isArray(players) && players.length > 0) ||
    (Array.isArray(shifts) && shifts.length > 0) ||
    (Array.isArray(gapFontes) && gapFontes.length > 0);
  const gapTextOk = typeof gap?.texto === "string" && gap.texto.trim().length > 0;
  return callOk && hasSource && gapTextOk;
}

// ---------- Na gringa ----------
// Validação/limpeza PURA do feed "Na gringa" (uma etapa, sem síntese cruzada).
// Regra dura: só item com fonte (url). O `id` é atribuído em CÓDIGO (g1..gN) na
// ordem final — a IA não precisa inventá-lo. `lagMonths` é estimativa da IA:
// aqui só garantimos que é número >= 0 (clamp), sem fingir precisão.

export const MAX_GRINGA_ITEMS = 12;

const GRINGA_LAGS: readonly GringaLag[] = ["nao-chegou", "chegando", "ja-chegou"];
const isGringaLag = (v: unknown): v is GringaLag => GRINGA_LAGS.includes(v as GringaLag);

// item bruto do coletor (sem id — o código atribui).
export interface RawGringaItem {
  source: string;
  title: string;
  region: string;
  flag: string;
  date: string;
  summary: string;
  lag: string;
  lagMonths: number;
  url: string;
}

export function validateGringa(raw: RawGringaItem[]): GringaItem[] {
  const seenUrls = new Set<string>();
  const items: GringaItem[] = [];
  for (const r of raw ?? []) {
    const url = stripNul(r?.url ?? "").trim(); // url é a fonte: nunca stripCitations
    if (!url) continue; // regra dura: sem fonte não entra
    if (seenUrls.has(url)) continue; // dedup por url
    if (!isGringaLag(r.lag)) continue; // lag fora do enum = item malformado
    seenUrls.add(url);
    // lagMonths: estimativa da IA; garante número finito >= 0 (senão 0).
    const months =
      typeof r.lagMonths === "number" && Number.isFinite(r.lagMonths) && r.lagMonths >= 0
        ? r.lagMonths
        : 0;
    items.push({
      id: `g${items.length + 1}`, // id estável atribuído em código, na ordem final
      source: cleanText(r.source),
      title: cleanText(r.title),
      region: cleanText(r.region),
      flag: stripNul(r.flag ?? "").trim(), // emoji: só tira byte nulo
      date: stripNul(r.date ?? "").trim(),
      summary: cleanText(r.summary),
      lag: r.lag,
      lagMonths: months,
      url,
    });
    if (items.length >= MAX_GRINGA_ITEMS) break;
  }
  return items;
}
