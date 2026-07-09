// SERVER-ONLY. Ponto único onde o scan é executado.
//
// O scan tem duas etapas (ver artefatos/arquiteturad.md §6):
//   ① COLETOR  — chama o provider COM busca web, devolve as notícias (items).
//   ② ANALISTA — chama o provider SEM busca, recebe os items e cruza os temas.
// Depois uma camada de validação em código (não é IA) limpa o resultado antes
// de virar grafo.
//
// Provider atual: OpenAI (Responses API). A chave (OPENAI_API_KEY) NUNCA pode
// chegar ao client (CLAUDE.md regra 1) — por isso este módulo é importado só
// pela rota /api/scan. Quando o MVP fechar, troca-se o provider por Claude aqui,
// sem tocar nos prompts (scanPrompt.ts) nem no resto do fluxo.

import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
  ANALYZE_SYSTEM_PROMPT,
  buildAnalyzeMessage,
  COLLECT_SYSTEM_PROMPT,
  buildCollectMessage,
  buildDeepDiveSystemPrompt,
  buildDeepDiveMessage,
  buildFinancialsSystemPrompt,
  buildFinancialsMessage,
} from "./scanPrompt";
import type {
  DeepDive,
  Financials,
  Insight,
  Lens,
  NewsItem,
  SavedIdea,
  ScanResult,
} from "@stalo/shared";

// Modelos por etapa — os "botões" de custo/qualidade.
// Coletor PRECISA de um modelo que suporte a tool web_search; Analista não.
const COLLECT_MODEL = "gpt-4.1-mini"; // barato + suporta web_search
const ANALYZE_MODEL = "gpt-5.4"; // síntese melhor, sem busca
const DEEP_DIVE_MODEL = "gpt-4.1-mini"; // mapa de mercado PRECISA de web_search (como o Coletor)
const FINANCIALS_MODEL = "gpt-5.4"; // análise financeira (2º nível)

const MAX_ITEMS = 15;
const MAX_INSIGHTS = 5;

// Orçamento de tokens de saída. Sem isso o JSON estruturado pode ser cortado no
// meio (JSON.parse quebra com "Unterminated string") quando há muitos itens —
// foi o que aconteceu ao subir de 8 para 15 notícias. Valores folgados: ~15
// notícias com todos os campos cabem bem abaixo disso, e o Analista idem.
const COLLECT_MAX_TOKENS = 8000;
const ANALYZE_MAX_TOKENS = 5000;
const DEEP_DIVE_MAX_TOKENS = 6000;
const FINANCIALS_MAX_TOKENS = 5000;

// Byte nulo (0x00): o Postgres rejeita esse caractere em colunas de texto e a
// saída do LLM/busca web às vezes o traz — precisa ser removido antes de gravar.
const NUL = String.fromCharCode(0);

const client = new OpenAI(); // lê OPENAI_API_KEY do ambiente

// Schemas de saída (structured outputs) — espelham NewsItem/Insight.
const NewsItemSchema = z.object({
  id: z.string(),
  topic: z.string(),
  title: z.string(),
  summary: z.string(),
  source: z.string(),
  url: z.string(),
  entities: z.array(z.string()),
  publishedAt: z.string(),
});
const CollectSchema = z.object({ items: z.array(NewsItemSchema) });

const InsightSchema = z.object({
  id: z.string(),
  type: z.enum(["tendencia", "gap", "oportunidade"]),
  title: z.string(),
  description: z.string(),
  rationale: z.string(),
  whyNow: z.string(),
  soWhat: z.string(),
  related_items: z.array(z.string()),
});
const AnalyzeSchema = z.object({ insights: z.array(InsightSchema) });

const MarketPlayerSchema = z.object({
  nome: z.string(),
  oQueFaz: z.string(),
  relacao: z.enum(["direto", "adjacente"]),
  url: z.string(),
});
const MarketAnalogueSchema = z.object({
  nome: z.string(),
  licao: z.string(),
});
// espinha comum aos três tipos: mapa + passos + sinais
const diveSpine = {
  market: z.object({
    players: z.array(MarketPlayerSchema),
    ondeValor: z.string(),
    analogas: z.array(MarketAnalogueSchema),
  }),
  proximosPassos: z.array(z.string()),
  sinais: z.array(
    z.object({
      kind: z.enum(["risco", "favor"]),
      text: z.string(),
    }),
  ),
};

// um schema por tipo: a espinha + o bloco de análise específico (typeAnalysis).
// Schema focado por tipo (em vez de campos opcionais vazios) = prompt mais nítido.
const TrendDiveSchema = z.object({
  ...diveSpine,
  typeAnalysis: z.object({
    kind: z.literal("tendencia"),
    estagio: z.string(),
    aceleradores: z.array(z.string()),
    freios: z.array(z.string()),
  }),
});
const GapDiveSchema = z.object({
  ...diveSpine,
  typeAnalysis: z.object({
    kind: z.literal("gap"),
    porqueAberto: z.string(),
    cemiterio: z.string(),
    aPonte: z.string(),
  }),
});
const OppDiveSchema = z.object({
  ...diveSpine,
  typeAnalysis: z.object({
    kind: z.literal("oportunidade"),
    beachhead: z.string(),
    menorTeste: z.string(),
  }),
});
const DIVE_SCHEMA_BY_TYPE = {
  tendencia: TrendDiveSchema,
  gap: GapDiveSchema,
  oportunidade: OppDiveSchema,
} as const;

const FinancialsSchema = z.object({
  mercado: z.string(),
  monetizacao: z.string(),
  premissas: z.array(z.string()),
  custoValidar: z.string(),
});

// ① COLETOR — busca web + extração estruturada das notícias.
// `days` é a janela de recência escolhida pelo usuário (null = sem limite de
// data); quando há janela, passamos a data-limite já calculada (modelo é ruim
// em conta de data).
async function collect(topics: string[], days: number | null): Promise<NewsItem[]> {
  const since =
    days != null ? new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10) : null;
  const res = await client.responses.parse({
    model: COLLECT_MODEL,
    tools: [{ type: "web_search" }],
    max_output_tokens: COLLECT_MAX_TOKENS,
    input: [
      { role: "system", content: COLLECT_SYSTEM_PROMPT },
      { role: "user", content: buildCollectMessage(topics, days, since) },
    ],
    text: { format: zodTextFormat(CollectSchema, "collect") },
  });
  return res.output_parsed?.items ?? [];
}

// ② ANALISTA — cruza as notícias já coletadas (sem busca web).
async function analyze(items: NewsItem[]): Promise<Insight[]> {
  const res = await client.responses.parse({
    model: ANALYZE_MODEL,
    max_output_tokens: ANALYZE_MAX_TOKENS,
    input: [
      { role: "system", content: ANALYZE_SYSTEM_PROMPT },
      { role: "user", content: buildAnalyzeMessage(items) },
    ],
    text: { format: zodTextFormat(AnalyzeSchema, "analyze") },
  });
  return res.output_parsed?.insights ?? [];
}

const stripNul = (s: string): string =>
  typeof s === "string" ? s.split(NUL).join("") : s;

// Camada de validação em código (não é IA): blinda o ScanResult antes do grafo.
function validateAndClean(items: NewsItem[], insights: Insight[]): ScanResult {
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

export async function runScan(topics: string[], days: number | null): Promise<ScanResult> {
  const items = await collect(topics, days);
  // sem notícias não há o que cruzar — pula o analista e economiza uma chamada
  if (items.length === 0) return { items: [], insights: [] };

  const insights = await analyze(items);
  const result = validateAndClean(items, insights);

  // erros de LLM (JSON malformado etc.) já sobem como exceção do provider e a
  // rota devolve erro visível ao usuário (CLAUDE.md: nunca falhar em silêncio).
  if (!isValidScanResult(result)) {
    throw new Error("Formato de resposta do scan inválido");
  }
  return result;
}

// ③ MERGULHAR — mapa de mercado da ideia salva, fundamentado em BUSCA WEB (quem
// já joga, onde o valor se acumula, jogadas análogas) + passos e sinais. A tese
// (rationale/soWhat/whyNow) já está na ideia; aqui é o andar novo. SERVER-ONLY.
// limpa o bloco de análise específico do tipo, preservando a discriminação `kind`
function cleanTypeAnalysis(
  ta:
    | { kind: "tendencia"; estagio: string; aceleradores: string[]; freios: string[] }
    | { kind: "gap"; porqueAberto: string; cemiterio: string; aPonte: string }
    | { kind: "oportunidade"; beachhead: string; menorTeste: string },
): DeepDive["typeAnalysis"] {
  if (ta.kind === "tendencia") {
    return {
      kind: "tendencia",
      estagio: stripNul(ta.estagio),
      aceleradores: ta.aceleradores.map(stripNul).filter((s) => s.trim()),
      freios: ta.freios.map(stripNul).filter((s) => s.trim()),
    };
  }
  if (ta.kind === "gap") {
    return {
      kind: "gap",
      porqueAberto: stripNul(ta.porqueAberto),
      cemiterio: stripNul(ta.cemiterio),
      aPonte: stripNul(ta.aPonte),
    };
  }
  return { kind: "oportunidade", beachhead: stripNul(ta.beachhead), menorTeste: stripNul(ta.menorTeste) };
}

export async function runDeepDive(idea: SavedIdea, lens?: Lens | null): Promise<DeepDive> {
  // o tipo do insight escolhe o schema E o bloco do prompt (eixo "tipo decide
  // quais perguntas"); a lente segue temperando o tom (eixo "lente decide o tom").
  const schema = DIVE_SCHEMA_BY_TYPE[idea.type];
  const res = await client.responses.parse({
    model: DEEP_DIVE_MODEL,
    tools: [{ type: "web_search" }], // o mapa é fundamentado em busca real (anti-alucinação no prompt)
    max_output_tokens: DEEP_DIVE_MAX_TOKENS,
    input: [
      { role: "system", content: buildDeepDiveSystemPrompt(idea.type, lens) },
      {
        role: "user",
        content: buildDeepDiveMessage({
          type: idea.type,
          title: idea.title,
          description: idea.description,
          rationale: idea.rationale,
          whyNow: idea.whyNow,
          soWhat: idea.soWhat,
          relatedItems: idea.relatedItems.map((it) => ({
            topic: it.topic,
            title: it.title,
            summary: it.summary,
            source: it.source,
          })),
        }),
      },
    ],
    text: { format: zodTextFormat(schema, "deep_dive") },
  });
  const dive = res.output_parsed;
  if (!dive) throw new Error("Mergulho: resposta vazia da IA");
  return {
    typeAnalysis: cleanTypeAnalysis(dive.typeAnalysis),
    market: {
      players: dive.market.players
        .map((p) => ({
          nome: stripNul(p.nome),
          oQueFaz: stripNul(p.oQueFaz),
          relacao: p.relacao,
          url: stripNul(p.url),
        }))
        .filter((p) => p.nome.trim()),
      ondeValor: stripNul(dive.market.ondeValor),
      analogas: dive.market.analogas
        .map((a) => ({ nome: stripNul(a.nome), licao: stripNul(a.licao) }))
        .filter((a) => a.nome.trim()),
    },
    proximosPassos: dive.proximosPassos.map(stripNul).filter((s) => s.trim()),
    sinais: dive.sinais
      .map((s) => ({ kind: s.kind, text: stripNul(s.text) }))
      .filter((s) => s.text.trim()),
  };
}

// ④ APROFUNDAR — análise financeira (2º nível), por cima do deep dive. Exige que
// a ideia já tenha sido mergulhada (usa o timing da ideia + "onde o valor se
// acumula" do mapa de mercado como contexto).
export async function runFinancials(idea: SavedIdea, lens?: Lens | null): Promise<Financials> {
  const res = await client.responses.parse({
    model: FINANCIALS_MODEL,
    max_output_tokens: FINANCIALS_MAX_TOKENS,
    input: [
      { role: "system", content: buildFinancialsSystemPrompt(lens) },
      {
        role: "user",
        content: buildFinancialsMessage({
          type: idea.type,
          title: idea.title,
          description: idea.description,
          soWhat: idea.soWhat,
          whyNow: idea.whyNow,
          ondeValor: idea.deepDive?.market?.ondeValor ?? "",
        }),
      },
    ],
    text: { format: zodTextFormat(FinancialsSchema, "financials") },
  });
  const fin = res.output_parsed;
  if (!fin) throw new Error("Financeiro: resposta vazia da IA");
  return {
    mercado: stripNul(fin.mercado),
    monetizacao: stripNul(fin.monetizacao),
    premissas: fin.premissas.map(stripNul).filter((s) => s.trim()),
    custoValidar: stripNul(fin.custoValidar),
  };
}
