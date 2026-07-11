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

// Item de notícia vindo da INGESTÃO de RSS da newsletter (não do scan/LLM).
// É um NewsItem com uma imagem opcional. `imageUrl` é ENRIQUECIMENTO visual,
// NUNCA critério de filtro — item sem imagem entra normalmente.
export interface NewsletterItem extends NewsItem {
  imageUrl?: string;
}

// Um "combo" da edição semanal: o resultado de cruzar um conjunto de setores
// numa origem (BR/gringa) — os itens da ingestão + os insights do Analista.
// Preenchido sob demanda e cacheado por combo na edição.
export interface NewsletterCombo {
  items: NewsletterItem[];
  insights: Insight[];
}

// Uma seção da edição montada (uma por origem), pronta pra renderizar.
export interface NewsletterSection {
  origem: "BR" | "GRINGA";
  items: NewsletterItem[];
  insights: Insight[];
}

// A edição montada para um conjunto de setores: as seções BR e gringa da semana.
export interface AssembledEdition {
  weekStart: string; // segunda-feira da semana (YYYY-MM-DD, UTC)
  sectors: string[];
  sections: NewsletterSection[];
}

// A linha persistida da edição da semana: os combos já calculados, indexados por
// "comboKey|origem" (cache sob demanda — cada combo roda o LLM só uma vez).
export interface NewsletterEdition {
  weekStart: string;
  combos: Record<string, NewsletterCombo>;
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

// Análise específica de cada TIPO de insight — o que muda a pergunta central do
// mergulho. Discriminada por `kind` (= o tipo do insight), pra a UI renderizar o
// bloco certo. A taxonomia continua universal (arquiteturad §7); isto é o eixo
// "tipo decide quais perguntas", separado do eixo "lente decide o tom".
export interface TrendAnalysis {
  kind: "tendencia";
  estagio: string; // emergente/acelerando/consolidando + 1 frase — LEITURA QUALITATIVA da IA, não medida
  aceleradores: string[]; // forças que empurram a tendência
  freios: string[]; // forças que a seguram
}
export interface GapAnalysis {
  kind: "gap";
  porqueAberto: string; // a barreira que manteve o vão aberto
  cemiterio: string; // quem tentou e por que falhou (ou "sem tentativas conhecidas")
  aPonte: string; // o que faria a ponte entre os dois lados
}
export interface OppAnalysis {
  kind: "oportunidade";
  beachhead: string; // o primeiro alvo/cunha concreto
  menorTeste: string; // o menor teste que confirma a hipótese
}
export type TypeAnalysis = TrendAnalysis | GapAnalysis | OppAnalysis;

export interface DeepDive {
  typeAnalysis: TypeAnalysis | null; // a análise específica do tipo (o eixo novo)
  market: MarketMap | null; // o mapa de mercado (espinha comum aos três tipos)
  proximosPassos: string[]; // passos concretos de validação
  sinais: DeepDiveSignal[]; // riscos e sinais a favor
  // Campos de mergulhos antigos — não renderizados, opcionais só pra não quebrar
  // JSON salvo antes dos redesenhos (pré-mapa e mapa-sem-typeAnalysis).
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

// "Veredito" (verdict): o parecer sobre a tese do usuário, no formato
// veredito-primeiro. Provider-neutro — no produto real cada item vem de uma
// busca web ao vivo (o Coletor) e passa pela regra dura: conexão sem fonte não
// aparece. As cinco seções (players, shifts, gap, threat, call) codificam a
// sequência evidência → parecer.
export type VerdictCall = "go" | "no-go" | "pivot";

// Uma fonte checável: é o que separa "clareza" de "inspiração de LinkedIn".
export interface VerdictSource {
  veiculo: string; // veículo/origem (ex.: Globo Rural)
  diz: string; // o que a fonte diz, em uma linha
  url: string;
  data: string; // ISO (YYYY-MM-DD)
}

// (i) Quem já faz isso no Brasil — a seção que mata ou salva a ideia.
export interface VerdictPlayer {
  nome: string;
  oQueFaz: string;
  relacao: "direto" | "adjacente";
  fonte: VerdictSource;
}

// (ii) O que mudou nos últimos 90 dias — a vantagem de timing (notícia fresca).
export interface VerdictShift {
  texto: string;
  fonte: VerdictSource;
}

export interface Verdict {
  thesis: { build: string; forWhom: string };
  sectors: string[]; // o cruzamento é o MEIO de achar o ângulo, não o fim
  players: VerdictPlayer[]; // (i)
  shifts: VerdictShift[]; // (ii)
  gap: { texto: string; fontes: VerdictSource[] }; // (iii)
  threat: { texto: string; fonte: VerdictSource }; // (iv) o que mata a ideia
  call: VerdictCall; // (v)
  callRationale: string;
  pivot: string | null; // sugestão de pivot quando call === "pivot"
  // regra dura tornada visível: quantas conexões o Coletor achou mas descartou
  // por não terem fonte checável. Custa recall, ganha confiança.
  discardedNoSource: number;
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

// "Na gringa": o que já se move lá fora ANTES de virar assunto no BR. Feed
// UNIVERSAL (não depende da tese nem do usuário) — a premissa é vantagem de
// timing. Provider-neutro; no produto real vem de busca contínua a fontes
// internacionais.

// defasagem pro Brasil: o coração do feed. "nao-chegou" é a maior janela de
// timing (ninguém aqui ainda), "chegando" está esquentando, "ja-chegou" perdeu
// a vantagem. A cor de cada estado reusa a paleta neon dos insights.
export type GringaLag = "nao-chegou" | "chegando" | "ja-chegou";

export interface GringaItem {
  id: string;
  source: string; // veículo — a fonte é o produto no Stalo, então fica em destaque
  title: string; // manchete curta
  region: string; // rótulo curto da região (US, EU, China…)
  flag: string; // emoji de bandeira/globo, só decorativo
  date: string; // ISO yyyy-mm-dd
  summary: string; // uma linha
  lag: GringaLag;
  lagMonths: number; // atraso típico ESTIMADO até o Brasil, em meses (não medido)
  url: string;
}

export const LAG_LABEL: Record<GringaLag, string> = {
  "nao-chegou": "Ainda não chegou ao BR",
  chegando: "Chegando ao BR",
  "ja-chegou": "Já chegou ao BR",
};
