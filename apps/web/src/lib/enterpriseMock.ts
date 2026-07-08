// Dados mockados do protótipo de workspace enterprise (rota /enterprise). Só
// existem no cliente, pra visualizar a UI — nenhum destes tipos ou dados é
// persistido, nem se conecta ao backend real (`packages/server`). Não confundir
// com `lib/workspace.ts`/`workspaceCookie.ts`, que são do workspace anônimo real.
import type { Insight, InsightType, NewsItem, Topic } from "@stalo/shared";
import { INSIGHT_COLORS } from "@/lib/graph";

// A taxonomia enterprise trabalha em DUAS camadas, em vez das tags soltas da
// primeira versão ("movimento competitivo" etc., que misturavam fato e leitura):
//
// Camada 1 — TIPO DE EVENTO: o que a notícia realmente relata. Concreto,
// citável, extraível da própria matéria — nunca interpretação. Espelha os
// business events de Contify/Owler e o grupo Strategic Moves do Feedly
// ("incidente" vem do Feedly, que cobre cyberattacks — necessário pro radar de
// segurança).
//
// Camada 2 — LEITURA ESTRATÉGICA: a interpretação Stalo sobre esses eventos —
// o que se vende. Deriva da taxonomia universal (tendência/gap/oportunidade,
// `InsightType` em @stalo/shared), com rótulo enterprise, mais "ameaça/risco
// competitivo" como leitura aditiva. Regra: whitespace/lacuna só existe quando
// derivada de padrão agregado (≥2 fontes) — nunca de uma única aresta.

export type EventType =
  | "lancamento"
  | "parceria"
  | "funding"
  | "ma"
  | "lideranca"
  | "expansao"
  | "preco"
  | "regulatorio"
  | "layoffs"
  | "resultado"
  | "incidente";

// `label` completo pro detalhe; `short` pros chips densos (lista/feed).
export const EVENT_TYPE_INFO: Record<EventType, { label: string; short: string }> = {
  lancamento: { label: "Lançamento de produto", short: "Lançamento" },
  parceria: { label: "Parceria", short: "Parceria" },
  funding: { label: "Funding / Investimento", short: "Funding" },
  ma: { label: "M&A / Aquisição", short: "M&A" },
  lideranca: { label: "Mudança de liderança", short: "Liderança" },
  expansao: { label: "Expansão (geográfica/capacidade)", short: "Expansão" },
  preco: { label: "Mudança de preço", short: "Preço" },
  regulatorio: { label: "Regulatório / Legal", short: "Regulatório" },
  layoffs: { label: "Layoffs / Reestruturação", short: "Layoffs" },
  resultado: { label: "Resultado financeiro", short: "Resultado" },
  incidente: { label: "Incidente de segurança", short: "Incidente" },
};

// No tier enterprise, toda notícia chega classificada pelo evento que relata.
export interface EnterpriseNewsItem extends NewsItem {
  eventType: EventType;
}

export type StrategicReading = "oportunidade" | "tendencia" | "whitespace" | "ameaca";

// Cores das leituras primárias vêm de INSIGHT_COLORS (mesmo glifo, mesma cor);
// "ameaça" reusa o vermelho do anel de ameaça do RadarScope. `label` completo
// pro detalhe; `short` pros chips densos (lista/feed).
export const READING_INFO: Record<StrategicReading, { label: string; short: string; color: string }> = {
  oportunidade: { label: "Oportunidade de mercado", short: "Oportunidade", color: INSIGHT_COLORS.oportunidade },
  tendencia: { label: "Tendência (movimento)", short: "Tendência", color: INSIGHT_COLORS.tendencia },
  whitespace: { label: "Whitespace / Lacuna", short: "Whitespace", color: INSIGHT_COLORS.gap },
  ameaca: { label: "Ameaça / Risco competitivo", short: "Ameaça", color: "#ff6b6b" },
};

export const READING_FOR_TYPE: Record<InsightType, StrategicReading> = {
  oportunidade: "oportunidade",
  tendencia: "tendencia",
  gap: "whitespace",
};

// A leitura primária deriva do tipo universal (não é armazenada, pra não poder
// divergir dele); "ameaça" entra por cima quando o insight está marcado.
export function readingsFor(insight: EnterpriseInsight): StrategicReading[] {
  const readings: StrategicReading[] = [READING_FOR_TYPE[insight.type]];
  if (insight.threat) readings.push("ameaca");
  return readings;
}

// O que de fato importa pra quem decide num negócio: receita, custo, clientes,
// qualidade. Sempre em ordem de grandeza/direção — nunca número inventado como
// se fosse exato (mesma regra já aplicada em `Financials`, packages/shared).
// Todos os campos são opcionais: cada insight preenche só as dimensões em que
// tem leitura real, não força as quatro por completude artificial.
export interface EnterpriseImpact {
  revenue?: string;
  cost?: string;
  customers?: string;
  quality?: string;
}

export const IMPACT_LABELS: Record<keyof EnterpriseImpact, string> = {
  revenue: "Receita",
  cost: "Custo",
  customers: "Clientes",
  quality: "Qualidade",
};

// Uma nota de time é sempre um comentário datado e assinado — nunca um campo
// único sobrescrito, porque o valor pra um grupo é o histórico de quem já
// validou/descartou a tese, não só a opinião mais recente.
export interface InsightComment {
  id: string;
  author: string; // nome do membro do time (subset de MOCK_TEAM)
  at: string; // ISO
  text: string;
}

export interface EnterpriseInsight extends Insight {
  threat: boolean; // leitura aditiva "ameaça/risco competitivo" (camada 2) — as demais derivam do `type`
  flaggedBy: string; // quem do time sinalizou esse insight primeiro
  impact: EnterpriseImpact;
  detectedAt: string; // ISO — quando essa tese apareceu pela 1ª vez numa varredura
  recurrence: number; // em quantas varreduras seguidas ela reapareceu (1 = só essa vez)
  comments: InsightComment[]; // thread de notas do time, mais antiga primeiro
}

// Uma rodada de coleta periódica (ver roadmap "Scan agendado"). O protótipo
// mocka um histórico fixo pra dar contexto real ao "ao vivo" da sala de
// situação — sem isso, o rótulo "AO VIVO" seria só decoração.
export interface EnterpriseScanRun {
  id: string;
  at: string; // ISO
  newInsights: number;
  reinforced: number; // quantos insights já conhecidos reapareceram nessa rodada
}

export interface EnterpriseRadar {
  id: string;
  name: string;
  topics: Topic[];
  items: EnterpriseNewsItem[];
  insights: EnterpriseInsight[];
  scans: EnterpriseScanRun[]; // ordem cronológica ascendente (mais antiga primeiro)
}

// ---- priorização (alta/média/baixa) ----
// Antídoto ao ruído: heurística, sem ML — fontes corroborando, reforço entre
// varreduras, recência e amplitude (quantos temas o sinal cruza, proxy do nº de
// players envolvidos). Segue o padrão Crayon de destacar pouca coisa como
// "alta" (~3% em escala real; aqui, ~1 por radar): se tudo é prioridade, nada é.
export type Priority = "alta" | "media" | "baixa";

export const PRIORITY_INFO: Record<Priority, { label: string; color: string }> = {
  alta: { label: "Alta", color: "#ff6b6b" },
  media: { label: "Média", color: "#e8a23d" },
  baixa: { label: "Baixa", color: "#7a8aa5" },
};

// Prioridade não é armazenada — é derivada, e devolve os motivos junto, pra UI
// sempre poder responder "por que isso é alta?" (prioridade sem justificativa
// vira caixa-preta e o time para de confiar).
export interface PriorityCall {
  level: Priority;
  score: number;
  reasons: string[];
}

const HOUR_MS = 3_600_000;

export function computePriority(insight: EnterpriseInsight, radar: EnterpriseRadar): PriorityCall {
  let score = 0;
  const reasons: string[] = [];

  // corroboração: quantas fontes sustentam a tese
  const sources = insight.related_items.length;
  score += Math.min(3, sources);
  if (sources > 1) reasons.push(`${sources} fontes corroboram`);

  // reforço: a mesma tese reapareceu em varreduras seguidas
  score += Math.min(3, insight.recurrence - 1);
  if (insight.recurrence > 1) reasons.push(`reforçada em ${insight.recurrence} varreduras`);

  // recência: medida contra a última varredura do radar (determinístico — não
  // depende do relógio de quem renderiza)
  const lastScanAt = radar.scans[radar.scans.length - 1]?.at ?? insight.detectedAt;
  const ageHours = (new Date(lastScanAt).getTime() - new Date(insight.detectedAt).getTime()) / HOUR_MS;
  if (ageHours <= 24) {
    score += 2;
    reasons.push("detectada nas últimas 24h");
  } else if (ageHours <= 48) {
    score += 1;
  }

  // amplitude: um sinal que cruza mais temas envolve mais players
  const byId = new Map(radar.items.map((item) => [item.id, item]));
  const crossedTopics = new Set(
    insight.related_items.map((id) => byId.get(id)?.topic).filter(Boolean),
  ).size;
  if (crossedTopics >= 2) {
    score += crossedTopics >= 3 ? 2 : 1;
    reasons.push(`cruza ${crossedTopics} temas`);
  }

  // risco é assimétrico: uma ameaça custa mais caro ignorar que uma
  // oportunidade — pesa um degrau a mais
  if (insight.threat) {
    score += 1;
    reasons.push("leitura de ameaça");
  }

  const level: Priority = score >= 7 ? "alta" : score >= 5 ? "media" : "baixa";
  return { level, score, reasons };
}

// Agrega os tipos de evento (camada 1) das fontes de um insight — mais
// frequente primeiro. É o resumo factual que sustenta a leitura estratégica.
export function eventMix(
  insight: EnterpriseInsight,
  radar: EnterpriseRadar,
): { type: EventType; count: number }[] {
  const byId = new Map(radar.items.map((item) => [item.id, item]));
  const counts = new Map<EventType, number>();
  for (const id of insight.related_items) {
    const item = byId.get(id);
    if (item) counts.set(item.eventType, (counts.get(item.eventType) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
}

export interface TopicActivity {
  topic: string;
  count: number; // quantas teses ativas tocam esse tema (não conta notícia solta)
  hot: boolean; // pelo menos uma tese nova detectada na última varredura
}

// Ranking "temas em alta": reaproveita os mesmos related_items já usados por
// eventMix/computePriority, só que agregado por tema em vez de por insight —
// nenhum dado novo, é outra leitura do que já existe no radar.
export function topicMix(radar: EnterpriseRadar): TopicActivity[] {
  const byId = new Map(radar.items.map((item) => [item.id, item]));
  const lastScanAt = radar.scans[radar.scans.length - 1]?.at;
  const base = new Map<string, { count: number; hot: boolean }>();
  for (const topic of radar.topics) base.set(topic.name, { count: 0, hot: false });

  for (const insight of radar.insights) {
    const touched = new Set<string>();
    for (const id of insight.related_items) {
      const item = byId.get(id);
      if (item) touched.add(item.topic);
    }
    for (const topicName of touched) {
      const entry = base.get(topicName) ?? { count: 0, hot: false };
      entry.count += 1;
      if (lastScanAt && insight.detectedAt === lastScanAt) entry.hot = true;
      base.set(topicName, entry);
    }
  }

  return radar.topics
    .map((t) => ({ topic: t.name, ...(base.get(t.name) ?? { count: 0, hot: false }) }))
    .sort((a, b) => b.count - a.count);
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: "admin" | "membro";
  status: "ativo" | "convite pendente";
}

export interface EnterpriseCompany {
  name: string;
  sector: string;
  competitors: string[]; // concorrentes monitorados (input estruturado do onboarding)
  products: string[]; // produtos/teses que o time acompanha
  plan: "Team" | "Business";
  seats: { used: number; total: number };
  scans: { used: number; limit: number };
}

export const MOCK_COMPANY: EnterpriseCompany = {
  name: "Norte Capital",
  sector: "Venture Capital",
  competitors: ["Kaszek", "monashees", "Canary", "Valor Capital"],
  products: ["Crédito embarcado", "Infra de agentes financeiros"],
  plan: "Business",
  seats: { used: 6, total: 10 },
  scans: { used: 148, limit: 400 },
};

// Sugestões de concorrentes por setor (onboarding): mata a "página em branco" —
// o usuário ajusta uma lista pré-preenchida em vez de lembrar nomes do zero.
// Matching por palavra-chave porque o campo de setor é texto livre.
const COMPETITOR_SUGGESTIONS: { keywords: string[]; competitors: string[] }[] = [
  {
    keywords: ["venture", "capital", "invest", "fundo", "vc"],
    competitors: ["Kaszek", "monashees", "Canary", "Valor Capital", "Astella", "Maya Capital"],
  },
  {
    keywords: ["fintech", "banco", "pagamento", "crédito", "credito"],
    competitors: ["Nubank", "Stone", "PagBank", "C6 Bank", "Creditas", "Neon"],
  },
  {
    keywords: ["consult"],
    competitors: ["McKinsey", "BCG", "Bain", "Accenture", "Deloitte"],
  },
  {
    keywords: ["varejo", "commerce", "loja"],
    competitors: ["Mercado Livre", "Amazon", "Shopee", "Magalu", "Americanas"],
  },
  {
    keywords: ["saúde", "saude", "health", "clínica", "clinica"],
    competitors: ["Dasa", "Rede D'Or", "Hapvida", "Alice", "Sami"],
  },
  {
    keywords: ["software", "saas", "tecnologia", "startup"],
    competitors: ["TOTVS", "Linx", "VTEX", "Sankhya", "Omie"],
  },
];

export function suggestCompetitors(sector: string): string[] {
  const normalized = sector.trim().toLowerCase();
  if (!normalized) return [];
  const hit = COMPETITOR_SUGGESTIONS.find((s) =>
    s.keywords.some((k) => normalized.includes(k)),
  );
  return hit?.competitors ?? [];
}

export const MOCK_TEAM: TeamMember[] = [
  { id: "u1", name: "Marina Prado", email: "marina@nortecapital.vc", role: "admin", status: "ativo" },
  { id: "u2", name: "Diego Lacerda", email: "diego@nortecapital.vc", role: "membro", status: "ativo" },
  { id: "u3", name: "Ana Beatriz Souza", email: "ana@nortecapital.vc", role: "membro", status: "ativo" },
  { id: "u4", name: "Felipe Nunes", email: "felipe@nortecapital.vc", role: "membro", status: "ativo" },
  { id: "u5", name: "Rafaela Kim", email: "rafaela@nortecapital.vc", role: "membro", status: "convite pendente" },
];

// Autor das notas adicionadas ao vivo no protótipo (sem login real ainda —
// ver regra 2 do CLAUDE.md, isso não vira auth de verdade aqui).
export const CURRENT_USER: TeamMember = MOCK_TEAM[0];

// Cadência de coleta mockada: uma varredura a cada ~12h, últimos 3 dias. As
// duas mesmas 6 marcações de tempo servem os dois radares (mesma empresa, mesma
// cadência) — só o conteúdo detectado em cada uma muda.
const SCAN_TIMES = [
  "2026-07-05T02:00:00",
  "2026-07-05T14:00:00",
  "2026-07-06T02:00:00",
  "2026-07-06T14:00:00",
  "2026-07-07T02:00:00",
  "2026-07-07T14:00:00",
];

const growthScans: EnterpriseScanRun[] = [
  { id: "gs1", at: SCAN_TIMES[0], newInsights: 1, reinforced: 0 },
  { id: "gs2", at: SCAN_TIMES[1], newInsights: 1, reinforced: 0 },
  { id: "gs3", at: SCAN_TIMES[2], newInsights: 1, reinforced: 0 },
  { id: "gs4", at: SCAN_TIMES[3], newInsights: 2, reinforced: 1 },
  { id: "gs5", at: SCAN_TIMES[4], newInsights: 0, reinforced: 2 },
  { id: "gs6", at: SCAN_TIMES[5], newInsights: 1, reinforced: 2 },
];

const securityScans: EnterpriseScanRun[] = [
  { id: "ss1", at: SCAN_TIMES[0], newInsights: 1, reinforced: 0 },
  { id: "ss2", at: SCAN_TIMES[1], newInsights: 1, reinforced: 0 },
  { id: "ss3", at: SCAN_TIMES[2], newInsights: 1, reinforced: 0 },
  { id: "ss4", at: SCAN_TIMES[3], newInsights: 2, reinforced: 1 },
  { id: "ss5", at: SCAN_TIMES[4], newInsights: 0, reinforced: 1 },
  { id: "ss6", at: SCAN_TIMES[5], newInsights: 1, reinforced: 2 },
];

const growthTopics: Topic[] = [
  { id: "fintech", name: "Fintech" },
  { id: "ia", name: "Inteligência Artificial" },
  { id: "mobilidade", name: "Mobilidade" },
];

const growthItems: EnterpriseNewsItem[] = [
  {
    id: "n1",
    eventType: "expansao",
    topic: "Fintech",
    title: "Bancos digitais latino-americanos ampliam crédito via modelos de IA generativa",
    summary: "Novos scores de crédito treinados com dados alternativos reduzem inadimplência em testes piloto.",
    source: "Valor Econômico",
    url: "https://example.com/fintech-ia-credito",
    entities: ["crédito", "IA generativa", "score alternativo"],
    publishedAt: "2026-06-18",
  },
  {
    id: "n2",
    eventType: "lancamento",
    topic: "Inteligência Artificial",
    title: "Startups de IA agêntica automatizam back-office financeiro",
    summary: "Agentes autônomos assumem conciliação e análise de risco em fundos de médio porte.",
    source: "TechCrunch",
    url: "https://example.com/agentes-back-office",
    entities: ["agentes autônomos", "back-office", "risco"],
    publishedAt: "2026-06-22",
  },
  {
    id: "n3",
    eventType: "lancamento",
    topic: "Mobilidade",
    title: "Aplicativos de mobilidade testam carteira embarcada para motoristas",
    summary: "Piloto integra pagamentos instantâneos e microcrédito direto no app do motorista parceiro.",
    source: "NeoFeed",
    url: "https://example.com/mobilidade-carteira",
    entities: ["carteira digital", "microcrédito", "motoristas"],
    publishedAt: "2026-06-25",
  },
  {
    id: "n4",
    eventType: "regulatorio",
    topic: "Fintech",
    title: "Regulador sinaliza norma para crédito concedido por algoritmos",
    summary: "Consulta pública propõe exigências de explicabilidade para decisões automatizadas de crédito.",
    source: "Reuters",
    url: "https://example.com/regulacao-credito-algoritmo",
    entities: ["regulação", "explicabilidade", "crédito"],
    publishedAt: "2026-06-27",
  },
  {
    id: "n5",
    eventType: "funding",
    topic: "Fintech",
    title: "Fundo especializado capta rodada para financiar frota de apps de entrega",
    summary: "Capital dedicado a frota digital cresce mais rápido que o crédito bancário tradicional pro setor.",
    source: "Brazil Journal",
    url: "https://example.com/fundo-frota-digital",
    entities: ["crédito", "frota digital", "fundo especializado"],
    publishedAt: "2026-07-01",
  },
  {
    id: "n6",
    eventType: "lancamento",
    topic: "Inteligência Artificial",
    title: "Provedor de IA lança modelo especializado em score de risco financeiro",
    summary: "Modelo pronto para uso reduz a barreira técnica de quem quer lançar crédito baseado em risco.",
    source: "TechCrunch",
    url: "https://example.com/modelo-score-risco",
    entities: ["modelo especializado", "score de risco"],
    publishedAt: "2026-07-03",
  },
  {
    id: "n7",
    eventType: "parceria",
    topic: "Mobilidade",
    title: "Grandes apps de mobilidade discutem padrão comum de identidade do motorista",
    summary: "Sem histórico portável, cada app reconstrói do zero a reputação de crédito do motorista.",
    source: "NeoFeed",
    url: "https://example.com/identidade-motorista",
    entities: ["identidade", "padrão comum", "motoristas"],
    publishedAt: "2026-07-06",
  },
];

const growthInsights: EnterpriseInsight[] = [
  {
    id: "gi1",
    type: "oportunidade",
    title: "Crédito embarcado em apps de mobilidade via agentes de IA",
    description:
      "Mobilidade e fintech convergem num produto de crédito instantâneo operado por agentes autônomos, sem equipe de risco dedicada.",
    rationale:
      "O mesmo padrão de agente autônomo que hoje faz conciliação em fundos está migrando para decisão de crédito em tempo real, e apps de mobilidade já têm a base de motoristas para embarcar isso.",
    whyNow: "Piloto de carteira embarcada já rodando; regulação ainda em consulta pública, não em vigor.",
    soWhat: "Janela de 6-9 meses para entrar antes que os grandes players de mobilidade internalizem isso.",
    related_items: ["n1", "n2", "n3"],
    threat: false,
    flaggedBy: "Marina Prado",
    impact: {
      revenue: "Nova linha B2B2C via parceria com apps de mobilidade — ainda sem cliente-piloto fechado",
      customers: "Motoristas parceiros ganham crédito que hoje não têm, reduz evasão pra concorrentes",
    },
    detectedAt: SCAN_TIMES[0],
    recurrence: 5,
    comments: [
      {
        id: "gi1-c1",
        author: "Ana Beatriz Souza",
        at: "2026-07-06T11:20:00",
        text: "Já conversei com 2 pessoas do setor, parece real — mobilidade tá mesmo de olho em crédito embarcado.",
      },
      {
        id: "gi1-c2",
        author: "Felipe Nunes",
        at: "2026-07-06T16:05:00",
        text: "Concordo, mas o ciclo de decisão desses apps costuma ser lento. Vale confirmar prazo antes de priorizar.",
      },
    ],
  },
  {
    id: "gi2",
    type: "gap",
    title: "Ninguém oferece explicabilidade de crédito algorítmico como serviço",
    description:
      "A exigência regulatória que está vindo cria demanda por uma camada de auditoria/explicabilidade que hoje nenhuma fintech oferece pronta.",
    rationale:
      "A consulta pública do regulador aponta pra explicabilidade obrigatória, mas os motores de score atuais (incluindo os de IA generativa) não nasceram auditáveis.",
    whyNow: "Consulta pública aberta agora — quem antecipar a norma vira o fornecedor de referência quando ela virar lei.",
    soWhat: "Categoria B2B nova: compliance-as-a-service para crédito algorítmico.",
    related_items: ["n4", "n1"],
    threat: false,
    flaggedBy: "Diego Lacerda",
    impact: {
      revenue: "Receita recorrente por assinatura — categoria nova, ainda sem preço de referência no mercado",
      cost: "Reduz o custo de compliance manual das fintechs clientes",
    },
    detectedAt: SCAN_TIMES[1],
    recurrence: 4,
    comments: [],
  },
  {
    id: "gi3",
    type: "tendencia",
    title: "Agentes autônomos substituindo camadas inteiras de back-office financeiro",
    description:
      "Não é mais copiloto: agentes de IA estão assumindo processos ponta a ponta em fundos de médio porte.",
    rationale: "Múltiplos sinais (conciliação, risco, agora crédito) mostram o mesmo padrão se replicando.",
    whyNow: "Adoção em fundos de médio porte é o estágio anterior à adoção em bancos grandes.",
    soWhat: "Fornecedores de infraestrutura de agentes para o setor financeiro viram tese de investimento própria.",
    related_items: ["n2"],
    threat: true,
    flaggedBy: "Ana Beatriz Souza",
    impact: {
      cost: "Reduz headcount de back-office em quem adota — pressão de custo sobre quem não adotar",
      quality: "Decisões de risco mais consistentes, menos erro humano no processo",
    },
    detectedAt: SCAN_TIMES[2],
    recurrence: 3,
    comments: [],
  },
  {
    id: "gi4",
    type: "oportunidade",
    title: "Score de risco especializado vira insumo comprável, não precisa treinar do zero",
    description:
      "Squads de crédito embarcado não precisam mais construir modelo de risco próprio — dá pra comprar o motor e focar na distribuição.",
    rationale:
      "O lançamento de um modelo especializado em score financeiro reduz a barreira técnica que hoje segura quem quer entrar em crédito embarcado.",
    whyNow: "Modelo acabou de ficar disponível como serviço — janela de vantagem pra quem monta produto antes da concorrência perceber.",
    soWhat: "Baixa o custo de entrada pra qualquer app de mobilidade lançar crédito embarcado em semanas, não meses.",
    related_items: ["n6", "n1"],
    threat: false,
    flaggedBy: "Felipe Nunes",
    impact: {
      cost: "Reduz custo de P&D de modelo de risco frente a construir do zero",
      revenue: "Acelera o time-to-market de uma nova linha de receita em meses",
    },
    detectedAt: SCAN_TIMES[3],
    recurrence: 2,
    comments: [],
  },
  {
    id: "gi5",
    type: "gap",
    title: "Identidade do motorista ainda não é portável entre apps",
    description:
      "Discussão de padrão comum de identidade abre espaço pra quem resolver isso primeiro virar a camada de confiança de todo o setor.",
    rationale:
      "Sem identidade portável, cada app reconstrói o histórico de crédito/risco do motorista do zero — motorista bom num app é desconhecido no outro.",
    whyNow: "A discussão do padrão comum começou agora, mas nenhum player assumiu a liderança técnica ainda.",
    soWhat: "Quem construir o registro de identidade/reputação portável vira infraestrutura que todo mundo depende.",
    related_items: ["n7", "n3"],
    threat: false,
    flaggedBy: "Ana Beatriz Souza",
    impact: {
      customers: "Vira ponto de retenção: apps que integram o padrão reduzem atrito de onboarding de motoristas",
      quality: "Melhora a precisão do score de risco ao herdar histórico de outros apps",
    },
    detectedAt: SCAN_TIMES[3],
    recurrence: 2,
    comments: [],
  },
  {
    id: "gi6",
    type: "tendencia",
    title: "Capital de crédito migrando de banco tradicional pra fundo especializado em frota digital",
    description:
      "Fundos dedicados a financiar frotas de apps de entrega/mobilidade estão captando rodadas maiores que os bancos tradicionais oferecem pro setor.",
    rationale: "A captação recente de um fundo especializado mostra que investidores já enxergam frota digital como classe de ativo própria.",
    whyNow: "Rodada acabou de fechar — capital especializado está entrando no setor agora, antes do banco tradicional se mexer.",
    soWhat: "Parcerias com esses fundos podem ficar mais baratas e rápidas que crédito bancário tradicional pro setor.",
    related_items: ["n5"],
    threat: false,
    flaggedBy: "Marina Prado",
    impact: {
      cost: "Custo de capital pra financiar frota pode cair frente ao crédito bancário tradicional",
      revenue: "Abre uma tese de coinvestimento nesses fundos especializados",
    },
    detectedAt: SCAN_TIMES[5],
    recurrence: 1,
    comments: [],
  },
];

const securityTopics: Topic[] = [
  { id: "ciberseguranca", name: "Cibersegurança" },
  { id: "cloud", name: "Cloud" },
  { id: "regulacao", name: "Regulação" },
];

const securityItems: EnterpriseNewsItem[] = [
  {
    id: "s1",
    eventType: "incidente",
    topic: "Cibersegurança",
    title: "Ataques a cadeias de fornecedores de IA generativa crescem 40% no trimestre",
    summary: "Modelos de terceiros embarcados em produtos financeiros viram vetor preferido de invasão.",
    source: "Dark Reading",
    url: "https://example.com/supply-chain-ia",
    entities: ["supply chain", "IA generativa", "vetor de ataque"],
    publishedAt: "2026-06-15",
  },
  {
    id: "s2",
    eventType: "lancamento",
    topic: "Cloud",
    title: "Provedores de nuvem lançam certificação própria para agentes de IA financeiros",
    summary: "Selo busca virar pré-requisito de compliance para bancos que rodam agentes em produção.",
    source: "The Information",
    url: "https://example.com/certificacao-agentes",
    entities: ["certificação", "cloud", "compliance"],
    publishedAt: "2026-06-20",
  },
  {
    id: "s3",
    eventType: "regulatorio",
    topic: "Regulação",
    title: "Banco central estuda exigir auditoria de terceiros para modelos de crédito",
    summary: "Proposta mira especificamente fornecedores externos de score e decisão automatizada.",
    source: "Bloomberg",
    url: "https://example.com/auditoria-terceiros",
    entities: ["auditoria", "terceiros", "banco central"],
    publishedAt: "2026-06-24",
  },
  {
    id: "s4",
    eventType: "preco",
    topic: "Cibersegurança",
    title: "Seguradoras passam a exigir auditoria de IA para apólice de cyber risk",
    summary: "Sem laudo de auditoria dos agentes em produção, prêmio de seguro sobe ou cobertura é negada.",
    source: "Reuters",
    url: "https://example.com/seguro-auditoria-ia",
    entities: ["seguradoras", "cyber risk", "auditoria"],
    publishedAt: "2026-07-01",
  },
  {
    id: "s5",
    eventType: "lancamento",
    topic: "Cloud",
    title: "Hyperscaler lança marketplace de agentes de IA pré-auditados",
    summary: "Categoria financeira, mais regulada, ainda ficou de fora do marketplace no lançamento.",
    source: "The Information",
    url: "https://example.com/marketplace-agentes-auditados",
    entities: ["marketplace", "agentes pré-auditados", "cloud"],
    publishedAt: "2026-07-03",
  },
  {
    id: "s6",
    eventType: "regulatorio",
    topic: "Regulação",
    title: "União Europeia propõe rótulo de risco para agentes autônomos financeiros",
    summary: "Proposta espelha o que o banco central local já vinha sinalizando, em jurisdição diferente.",
    source: "Politico",
    url: "https://example.com/ue-rotulo-risco-agentes",
    entities: ["União Europeia", "rótulo de risco", "regulação"],
    publishedAt: "2026-07-06",
  },
];

const securityInsights: EnterpriseInsight[] = [
  {
    id: "si1",
    type: "gap",
    title: "Falta um selo de segurança específico para agentes de IA financeiros",
    description:
      "Certificações de cloud cobrem infraestrutura, não o comportamento do agente em decisões de crédito — ninguém audita isso ainda.",
    rationale:
      "A certificação de cloud recém-lançada é sobre onde o agente roda, não sobre como ele decide — e é exatamente isso que o banco central quer auditar.",
    whyNow: "Duas iniciativas (cloud e banco central) miram o mesmo espaço em paralelo, sem se cruzar ainda.",
    soWhat: "Quem construir a camada de auditoria de comportamento vira o pré-requisito de todo mundo depois.",
    related_items: ["s2", "s3"],
    threat: false,
    flaggedBy: "Felipe Nunes",
    impact: {
      revenue: "Quem virar o selo de referência cobra por certificação recorrente",
      cost: "Reduz o custo de devida diligência manual que bancos hoje fazem caso a caso",
    },
    detectedAt: SCAN_TIMES[0],
    recurrence: 4,
    comments: [],
  },
  {
    id: "si2",
    type: "tendencia",
    title: "Ataques a fornecedores de modelo viram o novo phishing corporativo",
    description: "Supply chain de IA é hoje o vetor de entrada mais explorado contra empresas financeiras.",
    rationale: "O crescimento de 40% no trimestre acompanha a adoção acelerada de modelos de terceiros embarcados.",
    whyNow: "Ataques cresceram antes de qualquer certificação ou auditoria existir — a janela de exposição é agora.",
    soWhat: "Devida diligência de fornecedor de IA deveria ser item obrigatório em qualquer investimento em fintech AI-first.",
    related_items: ["s1"],
    threat: true,
    flaggedBy: "Marina Prado",
    impact: {
      cost: "Custo de responder a um incidente de supply chain supera em ordem de grandeza o custo de prevenção",
      quality: "Reduz o risco de uma decisão de crédito comprometida por modelo de terceiro violado",
    },
    detectedAt: SCAN_TIMES[1],
    recurrence: 4,
    comments: [
      {
        id: "si2-c1",
        author: "Diego Lacerda",
        at: "2026-07-05T09:40:00",
        text: "Descartar como tese nova — já vi esse padrão de ataque a supply chain de modelo no Q3, não é novidade pro nosso portfólio.",
      },
      {
        id: "si2-c2",
        author: "Rafaela Kim",
        at: "2026-07-05T14:12:00",
        text: "O padrão não é novo, mas o crescimento de 40% no trimestre é — acho que vale manter no radar como sinal de intensidade, não de novidade.",
      },
    ],
  },
  {
    id: "si3",
    type: "oportunidade",
    title: "Certificação de comportamento de agente como categoria própria",
    description: "Espaço aberto entre a certificação de infraestrutura (cloud) e a auditoria regulatória (banco central).",
    rationale: "Nenhum dos dois movimentos cobre a decisão do agente em si — o meio do funil está livre.",
    whyNow: "As duas iniciativas foram anunciadas na mesma semana, sem nenhum player claramente posicionado no meio.",
    soWhat: "Startup de auditoria comportamental de agentes financeiros: tese investível hoje, categoria sem dono.",
    related_items: ["s2", "s3", "s1"],
    threat: false,
    flaggedBy: "Rafaela Kim",
    impact: {
      revenue: "Tese investível com mercado ainda sem preço definido",
      customers: "Bancos médios adotam mais rápido que grandes bancos — segmento de entrada claro",
    },
    detectedAt: SCAN_TIMES[2],
    recurrence: 3,
    comments: [],
  },
  {
    id: "si4",
    type: "oportunidade",
    title: "Seguro cyber vira porta de entrada pra vender auditoria de agentes",
    description:
      "Seguradoras exigindo auditoria de IA criam demanda cativa: quem oferecer o laudo vira pré-requisito pra contratar apólice.",
    rationale: "A exigência da seguradora não é opcional pro cliente — cria demanda garantida que hoje ninguém atende de forma especializada.",
    whyNow: "Exigência é recente; ainda não existe fornecedor de referência que as seguradoras reconheçam.",
    soWhat: "Modelo de receita recorrente: laudo de auditoria vira pré-requisito anual, não venda única.",
    related_items: ["s4", "s1"],
    threat: false,
    flaggedBy: "Diego Lacerda",
    impact: {
      revenue: "Receita recorrente anual por cliente auditado, ligada à renovação de apólice",
      customers: "Seguradoras e fintechs auditadas viram canal de distribuição uma pra outra",
    },
    detectedAt: SCAN_TIMES[3],
    recurrence: 2,
    comments: [],
  },
  {
    id: "si5",
    type: "gap",
    title: "Marketplace de agentes pré-auditados ainda não cobre agentes financeiros",
    description:
      "O hyperscaler abriu um marketplace de agentes auditados, mas a categoria financeira ficou de fora — ninguém quis assumir o risco de auditar isso ainda.",
    rationale: "Categorias mais simples já têm agente pré-auditado; financeiro é o vazio mais valioso do marketplace.",
    whyNow: "O marketplace acabou de abrir — a vaga pra categoria financeira está literalmente esperando alguém preencher.",
    soWhat: "Ser o primeiro agente financeiro pré-auditado nesse marketplace vira canal de distribuição instantâneo.",
    related_items: ["s5", "s2"],
    threat: false,
    flaggedBy: "Rafaela Kim",
    impact: {
      revenue: "Distribuição via marketplace do hyperscaler reduz custo de aquisição de cliente",
      quality: "Selo do marketplace funciona como prova social de qualidade/segurança",
    },
    detectedAt: SCAN_TIMES[3],
    recurrence: 2,
    comments: [],
  },
  {
    id: "si6",
    type: "tendencia",
    title: "Rotulagem de risco de agentes financeiros vira padrão global, não só nacional",
    description: "A proposta europeia de rótulo de risco espelha o que o banco central local já sinalizou — a regulação está convergindo.",
    rationale: "Duas jurisdições diferentes miram o mesmo tipo de exigência quase ao mesmo tempo — não é coincidência, é tendência regulatória.",
    whyNow: "A convergência entre jurisdições ainda está começando — dá tempo de se antecipar antes de virar exigência simultânea.",
    soWhat: "Quem construir auditoria compatível com múltiplas jurisdições de uma vez ganha escala internacional de saída.",
    related_items: ["s6", "s3"],
    threat: false,
    flaggedBy: "Ana Beatriz Souza",
    impact: {
      cost: "Evita retrabalho de compliance por país ao construir auditoria multi-jurisdição desde o início",
      revenue: "Abre mercado de exportação do serviço de auditoria pra clientes fora do Brasil",
    },
    detectedAt: SCAN_TIMES[5],
    recurrence: 1,
    comments: [],
  },
];

export const MOCK_RADARS: EnterpriseRadar[] = [
  {
    id: "growth",
    name: "Radar de Growth",
    topics: growthTopics,
    items: growthItems,
    insights: growthInsights,
    scans: growthScans,
  },
  {
    id: "seguranca",
    name: "Radar de Segurança",
    topics: securityTopics,
    items: securityItems,
    insights: securityInsights,
    scans: securityScans,
  },
];

// ---- P0: detecção de mudança (histórico + delta semana a semana) ----
// O que separa "scan sob demanda" (commodity) de "detecção de mudança"
// (produto): snapshots por semana e o delta entre eles. No protótipo os
// snapshots são fixos; no real, cada varredura persiste e o delta é derivado.
export type DeltaKind = "novo" | "reforcado" | "subiu" | "esfriou";

export const DELTA_KIND_INFO: Record<DeltaKind, { label: string; color: string }> = {
  novo: { label: "Novo", color: "#5ec8d8" },
  reforcado: { label: "Reforçado", color: "#63d29b" },
  subiu: { label: "Prioridade subiu", color: "#ff6b6b" },
  esfriou: { label: "Esfriou", color: "#7a8aa5" },
};

export interface DeltaEntry {
  kind: DeltaKind;
  insightId?: string; // presente quando o sinal segue ativo no radar (clicável na UI)
  title: string;
  note: string; // o que mudou, em uma linha
}

export interface WeeklySnapshot {
  id: string;
  label: string; // intervalo humano da semana
  scans: number; // varreduras rodadas na semana
  entries: DeltaEntry[];
}

// por radar, mais recente primeiro
export const MOCK_WEEKLY_DELTAS: Record<string, WeeklySnapshot[]> = {
  growth: [
    {
      id: "gw-atual",
      label: "6 – 12 jul (semana atual)",
      scans: 4,
      entries: [
        {
          kind: "subiu",
          insightId: "gi1",
          title: "Crédito embarcado em apps de mobilidade via agentes de IA",
          note: "média → alta: ganhou a 3ª fonte e agora cruza 3 temas",
        },
        {
          kind: "novo",
          insightId: "gi6",
          title: "Capital de crédito migrando pra fundo especializado em frota digital",
          note: "detectado na varredura de 7 jul, 1 fonte — ainda baixa prioridade",
        },
        {
          kind: "novo",
          insightId: "gi4",
          title: "Score de risco especializado vira insumo comprável",
          note: "detectado em 6 jul; já reapareceu na varredura seguinte",
        },
        {
          kind: "novo",
          insightId: "gi5",
          title: "Identidade do motorista ainda não é portável entre apps",
          note: "detectado em 6 jul, 2 fontes de mobilidade",
        },
        {
          kind: "reforcado",
          insightId: "gi2",
          title: "Ninguém oferece explicabilidade de crédito algorítmico como serviço",
          note: "4ª varredura seguida em que a tese reaparece",
        },
        {
          kind: "esfriou",
          title: "Superapps asiáticos entrando em crédito na América Latina",
          note: "sem fonte nova há 2 varreduras — saiu do radar ativo",
        },
      ],
    },
    {
      id: "gw-anterior",
      label: "29 jun – 5 jul",
      scans: 5,
      entries: [
        {
          kind: "novo",
          insightId: "gi1",
          title: "Crédito embarcado em apps de mobilidade via agentes de IA",
          note: "entrou com 2 fontes; prioridade média",
        },
        {
          kind: "novo",
          insightId: "gi2",
          title: "Ninguém oferece explicabilidade de crédito algorítmico como serviço",
          note: "derivado da consulta pública do regulador",
        },
        {
          kind: "novo",
          title: "Superapps asiáticos entrando em crédito na América Latina",
          note: "1 fonte — entrou em observação",
        },
      ],
    },
  ],
  seguranca: [
    {
      id: "sw-atual",
      label: "6 – 12 jul (semana atual)",
      scans: 4,
      entries: [
        {
          kind: "subiu",
          insightId: "si3",
          title: "Certificação de comportamento de agente como categoria própria",
          note: "média → alta: 3ª fonte fechou o triângulo cloud × regulação × ataque",
        },
        {
          kind: "novo",
          insightId: "si6",
          title: "Rotulagem de risco de agentes vira padrão global",
          note: "proposta da UE espelha o banco central — convergência regulatória",
        },
        {
          kind: "novo",
          insightId: "si4",
          title: "Seguro cyber vira porta de entrada pra vender auditoria",
          note: "exigência de laudo detectada em 6 jul",
        },
        {
          kind: "reforcado",
          insightId: "si2",
          title: "Ataques a fornecedores de modelo viram o novo phishing corporativo",
          note: "4ª varredura seguida — leitura de ameaça mantida",
        },
        {
          kind: "esfriou",
          title: "Escassez de GPU travando agentes em produção",
          note: "nenhuma fonte nova desde 28 jun — arquivado",
        },
      ],
    },
    {
      id: "sw-anterior",
      label: "29 jun – 5 jul",
      scans: 5,
      entries: [
        {
          kind: "novo",
          insightId: "si1",
          title: "Falta um selo de segurança específico para agentes financeiros",
          note: "entrou cruzando certificação de cloud com auditoria do BC",
        },
        {
          kind: "novo",
          insightId: "si2",
          title: "Ataques a fornecedores de modelo viram o novo phishing corporativo",
          note: "crescimento de 40% no trimestre — marcado como ameaça",
        },
        {
          kind: "novo",
          title: "Escassez de GPU travando agentes em produção",
          note: "1 fonte — entrou em observação",
        },
      ],
    },
  ],
};

// ---- P0: digest semanal por e-mail ----
// A entrega enterprise mais universal (Crayon, Klue, Feedly e Owler têm todas):
// os sinais de alta prioridade da semana + leitura estratégica + fontes, por
// setor/concorrente, na caixa de entrada do time. O conteúdo do preview é
// GERADO dos dados reais do radar (computePriority etc.), não redigitado aqui.
export interface DigestSettings {
  day: string;
  hour: string;
  recipients: string[]; // e-mails do time que recebem
  radarIds: string[];
}

export const MOCK_DIGEST: DigestSettings = {
  day: "segunda",
  hour: "08:00",
  recipients: MOCK_TEAM.filter((m) => m.status === "ativo").map((m) => m.email),
  radarIds: ["growth", "seguranca"],
};

// ---- P1: alertas de mudança ----
// Dispara quando surge evento que casa com a regra (tipo de evento × prioridade
// mínima). Começa por e-mail; Slack/Teams ficam visíveis como "em breve" pra
// vender a direção sem prometer data.
export interface AlertRule {
  id: string;
  label: string;
  description: string;
  eventTypes: EventType[]; // vazio = qualquer evento
  minPriority: Priority;
  enabled: boolean;
}

export const MOCK_ALERT_RULES: AlertRule[] = [
  {
    id: "r1",
    label: "Mudança de preço de concorrente",
    description: "Qualquer evento de preço nos temas monitorados",
    eventTypes: ["preco"],
    minPriority: "baixa",
    enabled: true,
  },
  {
    id: "r2",
    label: "Novo entrante / movimento de capital",
    description: "Funding ou M&A que toca os produtos monitorados",
    eventTypes: ["funding", "ma"],
    minPriority: "media",
    enabled: true,
  },
  {
    id: "r3",
    label: "Regulatório em tema monitorado",
    description: "Norma, consulta pública ou decisão que muda a regra do jogo",
    eventTypes: ["regulatorio"],
    minPriority: "media",
    enabled: true,
  },
  {
    id: "r4",
    label: "Qualquer sinal de alta prioridade",
    description: "Rede de segurança: nada de alta passa sem aviso",
    eventTypes: [],
    minPriority: "alta",
    enabled: true,
  },
];

export interface AlertLogEntry {
  id: string;
  at: string; // ISO
  radarId: string;
  insightId?: string;
  title: string;
  trigger: string; // qual regra disparou e por quê
}

export const MOCK_ALERT_LOG: AlertLogEntry[] = [
  {
    id: "a1",
    at: "2026-07-07T14:24:00",
    radarId: "seguranca",
    insightId: "si6",
    title: "UE propõe rótulo de risco para agentes autônomos financeiros",
    trigger: "Regulatório em tema monitorado · evento Regulatório/Legal",
  },
  {
    id: "a2",
    at: "2026-07-07T14:21:00",
    radarId: "growth",
    insightId: "gi1",
    title: "Crédito embarcado em apps de mobilidade subiu pra alta prioridade",
    trigger: "Qualquer sinal de alta prioridade · 3 fontes, 3 temas",
  },
  {
    id: "a3",
    at: "2026-07-06T02:37:00",
    radarId: "seguranca",
    insightId: "si4",
    title: "Seguradoras passam a exigir auditoria de IA para apólice cyber",
    trigger: "Mudança de preço de concorrente · evento Mudança de preço",
  },
  {
    id: "a4",
    at: "2026-07-05T14:12:00",
    radarId: "growth",
    insightId: "gi6",
    title: "Fundo especializado capta rodada para financiar frota de apps",
    trigger: "Novo entrante / movimento de capital · evento Funding",
  },
];

// ---- P2: colaboração leve (boards compartilhados) ----
// O que separa workspace de time do uso solo: sinais salvos viram boards com
// dono e audiência, não abas de navegador de cada analista.
export interface SharedBoard {
  id: string;
  name: string;
  radarId: string;
  members: string[]; // nomes (subset do MOCK_TEAM)
  signals: number; // sinais salvos no board
  updatedAt: string; // ISO
}

export const MOCK_BOARDS: SharedBoard[] = [
  {
    id: "b1",
    name: "Tese: crédito embarcado",
    radarId: "growth",
    members: ["Marina Prado", "Diego Lacerda", "Felipe Nunes"],
    signals: 4,
    updatedAt: "2026-07-07T18:40:00",
  },
  {
    id: "b2",
    name: "Auditoria de agentes — categoria sem dono",
    radarId: "seguranca",
    members: ["Rafaela Kim", "Ana Beatriz Souza"],
    signals: 3,
    updatedAt: "2026-07-06T11:15:00",
  },
  {
    id: "b3",
    name: "Digest interno de segunda",
    radarId: "growth",
    members: ["Marina Prado", "Ana Beatriz Souza", "Diego Lacerda", "Felipe Nunes"],
    signals: 6,
    updatedAt: "2026-07-06T08:05:00",
  },
];
