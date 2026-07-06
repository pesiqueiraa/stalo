export type InsightType = "tendencia" | "gap" | "oportunidade";

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
// salva. Só a parte GERADA vive aqui — panorama, timing, passos e sinais. O
// "por que conecta" (rationale) e o "e daí?" (soWhat) já estão na própria ideia.
export interface DeepDiveSignal {
  kind: "risco" | "favor";
  text: string;
}
export interface DeepDive {
  panorama: string; // o setup: os vetores que se aproximam
  porQueAgora: string; // timing / urgência
  proximosPassos: string[]; // passos concretos de validação
  sinais: DeepDiveSignal[]; // riscos e sinais a favor
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
  soWhat: string; // "e daí?" — snapshot do insight de origem
  notes: string; // anotação do usuário no momento do save (por que isso importa)
  savedAt: string;
  relatedItems: NewsItem[];
  deepDive: DeepDive | null; // null = ainda não mergulhado
  financials: Financials | null; // null = mergulho ainda não aprofundado no financeiro
}
