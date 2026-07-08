export type InsightType = "tendencia" | "gap" | "oportunidade";

// Lente/perfil do usuário, escolhida no onboarding. Não muda a taxonomia de
// insights (universal); afina a "linguagem de direcionamento" do mergulho e o
// ranqueamento do brief (ver arquiteturad §7).
export type Lens = "founder" | "investor" | "explorer";

export interface Topic {
  id: string;
  name: string;
}

export interface NewsItem {
  id: string;
  topic: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  entities: string[];
  publishedAt: string;
}

export interface Insight {
  id: string;
  type: InsightType;
  title: string;
  description: string;
  rationale: string; // "por que conecta": a linha de raciocínio entre os setores
  whyNow: string; // "por que agora": o sinal de timing que torna o cruzamento relevante neste momento
  soWhat: string; // "e daí?": a ação/oportunidade concreta
  related_items: string[];
}

export interface ScanResult {
  items: NewsItem[];
  insights: Insight[];
}

export interface NewsNode extends NewsItem {
  kind: "news";
  color: string;
  r: number;
}

export interface InsightNode {
  kind: "insight";
  id: string;
  insightType: InsightType;
  title: string;
  description: string;
  rationale: string;
  whyNow: string;
  soWhat: string;
  related: string[];
  color: string;
  r: number;
}

export type GraphNode = NewsNode | InsightNode;

export interface GraphLink {
  source: string;
  target: string;
  kind: "entity" | "insight";
}

export interface Graph {
  nodes: GraphNode[];
  links: GraphLink[];
}

// "Mergulhar" (deep dive): o relatório fundo gerado pela IA a partir da ideia
// salva. Reinventado como MAPA DE MERCADO — onde o brief diz "aqui está o gap",
// o mergulho diz "quem já joga perto dele e onde o valor se acumula". O "por que
// conecta" (rationale) e o "e daí?" (soWhat) já estão na própria ideia.
export interface DeepDiveSignal {
  kind: "risco" | "favor";
  text: string;
}

// Um player do mercado, fundamentado em busca web (com fonte quando houver).
export interface MarketPlayer {
  nome: string;
  oQueFaz: string; // 1 linha do que fazem
  relacao: "direto" | "adjacente"; // concorrente direto vs. play adjacente
  url: string; // fonte/rastreabilidade; "" quando não houver
}

// Uma jogada análoga em outro mercado, com a lição que ela dá.
export interface MarketAnalogue {
  nome: string;
  licao: string;
}

// O mapa de mercado gerado com busca web: quem joga, onde o valor se acumula,
// jogadas análogas. Anti-alucinação vive no prompt (só nomear o que encontrou).
export interface MarketMap {
  players: MarketPlayer[];
  ondeValor: string; // onde/quem captura valor na cadeia
  analogas: MarketAnalogue[];
}

export interface DeepDive {
  market: MarketMap | null; // o mapa de mercado (protagonista do novo mergulho)
  proximosPassos: string[]; // passos concretos de validação
  sinais: DeepDiveSignal[]; // riscos e sinais a favor
  // Campos do mergulho antigo — não são mais renderizados, ficam opcionais só
  // pra não quebrar JSON de mergulhos salvos antes do redesenho.
  panorama?: string;
  porQueAgora?: string;
}

// Segundo nível do mergulho: a análise financeira dedicada, gerada sob demanda
// por cima do deep dive. Trabalha com ordens de grandeza e "o que precisa ser
// verdade", não com números precisos inventados.
export interface Financials {
  mercado: string; // tamanho/atratividade em ordem de grandeza
  monetizacao: string; // como ganharia dinheiro
  premissas: string[]; // o que precisa ser verdade nos números
  custoValidar: string; // quão barato dá pra testar a hipótese financeira
}

export interface SavedIdea {
  id: string;
  insightRef: string; // ref do insight de origem no scan (i1, i2…); efêmero — a detecção de "já salva" é por conteúdo (tipo+título), não por esse ref
  type: InsightType;
  title: string;
  description: string;
  rationale: string; // "por que conecta" — snapshot do insight de origem
  whyNow: string; // "por que agora" — snapshot do insight de origem
  soWhat: string; // "e daí?" — snapshot do insight de origem
  notes: string; // anotação do usuário no momento do save (por que isso importa)
  savedAt: string;
  relatedItems: NewsItem[];
  deepDive: DeepDive | null; // null = ainda não mergulhado
  financials: Financials | null; // null = mergulho ainda não aprofundado no financeiro
}
