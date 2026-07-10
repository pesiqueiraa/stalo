// Fonte da verdade dos prompts de scan (busca + extração de JSON).
//
// CLAUDE.md regra 4: os prompts vivem num único módulo compartilhado — não
// duplicar em outros lugares do backend. Ao alterá-los, garanta que o formato
// descrito continua compatível com os tipos NewsItem/Insight e com buildGraph()
// no frontend (frontend/src/lib/graph.ts).
//
// A arquitetura de scan tem DUAS etapas (ver frontend/src/server/scan.ts):
//   ① COLETOR  — busca web ligada, devolve só as notícias (items).
//   ② ANALISTA — sem busca, recebe os items e cruza os temas → insights.
// Cada etapa tem seu prompt aqui. São provider-neutros de propósito: descrevem
// a tarefa, não a API. A saída em JSON é garantida por structured outputs no
// provider (schema Zod em scan.ts), então os prompts focam nas REGRAS, não na
// formatação do JSON.

import type { Lens } from "@stalo/shared";

// ---------- ① COLETOR ----------

export const COLLECT_SYSTEM_PROMPT = `Você é um motor de pesquisa de notícias de tecnologia e negócios.
Use a busca na web para encontrar notícias recentes e ESPECÍFICAS sobre os temas fornecidos, respeitando a JANELA DE TEMPO indicada na mensagem do usuário (quando houver).
Sua ÚNICA tarefa é coletar e estruturar notícias — NÃO tire conclusões nem cruze temas (isso é feito em outra etapa).

Cada notícia deve ser um ACONTECIMENTO concreto e datável (um lançamento, um investimento, uma decisão, um resultado) — não matéria genérica, institucional ou "evergreen", e não artigo acadêmico/paper (use veículos de imprensa).

Para cada notícia, produza:
- id: identificador sequencial curto começando em "n1", "n2", ...
- topic: exatamente um dos temas fornecidos, escrito igual ao que foi passado
- title: título curto, fiel ao artigo (não deduza nem invente nomes de produtos, números ou fatos que não estejam na fonte)
- summary: resumo em 1 frase, até 20 palavras, em português, baseado no que a fonte de fato diz
- source: nome do veículo original (ex: "Reuters", "Valor Econômico"); prefira a fonte original a agregadores
- url: link DIRETO do artigo específico. NUNCA uma home, página de seção ou índice de listagem (ex: ".../noticias-sobre/energia/"). Se só houver página de listagem, descarte essa notícia e busque outra
- entities: até 3 palavras-chave TEMÁTICAS e NORMALIZADAS — substantivos comuns que possam reaparecer em outras notícias e criar conexões (ex: "chips", "data center", "regulação", "energia renovável", "baterias"). NÃO use nomes próprios específicos de um único artigo (empresa, produto, pessoa), que não conectam nada
- publishedAt: data de publicação real do artigo, no formato AAAA-MM-DD; se não for possível datar a notícia, descarte-a

Regras: no máximo 3 notícias por tema, no máximo 15 no total. Evite duplicar a mesma notícia entre temas.
Se a mensagem indicar uma data-limite, DESCARTE qualquer notícia publicada antes dela, por mais relevante que pareça.
Nunca invente notícias — baseie-se apenas no que encontrar na busca. Se não achar nada relevante e específico para um tema, pule esse tema (é melhor devolver menos que encher com genérico).`;

export function buildCollectMessage(
  topics: string[],
  days: number | null,
  since: string | null,
): string {
  const window =
    days != null && since != null
      ? `Janela de tempo: APENAS notícias publicadas nos últimos ${days} dias — ou seja, a partir de ${since} (AAAA-MM-DD). Descarte qualquer notícia mais antiga que essa data.`
      : `Sem restrição de data: traga as notícias mais recentes e relevantes que encontrar (priorize as mais novas).`;
  return `Temas para monitorar agora: ${topics.join(", ")}.
${window}
Pesquise notícias sobre cada tema e devolva as notícias estruturadas.`;
}

// ---------- ② ANALISTA ----------

export const ANALYZE_SYSTEM_PROMPT = `Você é um analista que cruza notícias de tecnologia e negócios entre setores diferentes.
Você recebe uma lista de notícias JÁ COLETADAS (cada uma com um id). Sua tarefa é identificar tendências emergentes, lacunas de mercado (gaps) ou oportunidades que CONECTAM os temas entre si.
Para cada insight, produza:
- id: identificador sequencial curto começando em "i1", "i2", ...
- type: um de "tendencia", "gap" ou "oportunidade"
- title: título curto e direto
- description: a frase de efeito — explicação em até 25 palavras, em português, do porquê isso é relevante, cruzando informação entre temas
- rationale: a LINHA DE RACIOCÍNIO, em 2 a 3 frases: por que essas notícias ESPECÍFICAS, de setores diferentes, se conectam nesse insight. Nomeie os setores/temas envolvidos e o que cada um contribui para a conexão. Não repita a description literalmente
- whyNow: o "POR QUE AGORA", em 1 a 2 frases: o SINAL DE TIMING que torna esse cruzamento relevante NESTE momento — o que mudou agora (um movimento recente, uma barreira que caiu, uma janela que abriu) e por que esperar custaria. Não repita o rationale; foco no tempo, não na lógica da conexão
- soWhat: o "E DAÍ?", em 1 a 2 frases: o que um empreendedor faria com isso — a ação ou o ângulo de oportunidade concreto (um produto, um segmento a atacar, uma hipótese a validar). Prático, não genérico
- related_items: lista dos ids das notícias fornecidas que esse insight conecta — pelo menos 2, e SOMENTE ids que existem na lista recebida
Regras: no máximo 5 insights. Priorize insights que conectam mais de um tema entre si.
Nos campos de TEXTO (description, rationale, whyNow, soWhat) escreva em prosa corrida e SOMENTE em português do Brasil, no alfabeto latino (nunca outros alfabetos ou idiomas) — e NUNCA cite notícias por código/id (ex.: n1, n10, [n3]); os ids vão SOMENTE no campo related_items.
NUNCA invente notícias nem ids — use apenas as notícias fornecidas. Se não houver conexão relevante entre elas, devolva menos insights (ou nenhum).`;

interface CollectedItem {
  id: string;
  topic: string;
  title: string;
  summary: string;
  entities: string[];
}

// ---------- ③ MERGULHAR (deep dive) ----------
// Expande uma ideia salva num relatório fundo. Recebe a semente (título,
// descrição, "por que conecta", "e daí?") + as notícias que ela cruza, e gera
// SÓ as seções novas (não repete o rationale/soWhat, que a UI já tem).

// A "linguagem de direcionamento" do mergulho muda por lente (arquiteturad §7):
// o esquema de saída é o MESMO (panorama, porQueAgora, proximosPassos, sinais),
// mas o público e o que conta como "próximo passo" se ajustam ao perfil. A
// taxonomia de insight (tendência/gap/oportunidade) não muda aqui.
const DEEP_DIVE_LENS: Record<Lens, { audience: string; passos: string }> = {
  founder: {
    audience: "para um FOUNDER early-stage decidir se vale a pena CONSTRUIR",
    passos:
      "- proximosPassos: 3 a 4 passos CONCRETOS de validação com cliente/mercado, na ordem em que fariam sentido. Cada passo é uma frase de ação (comece com verbo). Priorize conversar com pessoas reais antes de construir",
  },
  investor: {
    audience: "para um INVESTIDOR avaliar se isso vira uma tese/deal defensável",
    passos:
      "- proximosPassos: 3 a 4 passos de DILIGÊNCIA na ordem em que fariam sentido — mapear quem já está construindo (inclusive stealth), medir o tamanho da janela, e identificar o que separaria um vencedor. Cada passo é uma frase de ação (comece com verbo)",
  },
  explorer: {
    audience:
      "para quem quer ENTENDER a tendência e se posicionar cedo (não necessariamente construir ou investir)",
    passos:
      "- proximosPassos: 3 a 4 SINAIS A ACOMPANHAR pra saber se a tendência se confirma ou esfria (métricas, movimentos de players, marcos regulatórios). Cada um é uma frase começando com um verbo de observação (Acompanhe, Monitore, Observe)",
  },
};

// O bloco de análise ESPECÍFICO de cada tipo — a pergunta central que muda por
// tipo (arquiteturad §7, eixo "tipo decide quais perguntas"). O eixo "lente
// decide o tom" continua vindo de DEEP_DIVE_LENS.
type InsightTypeKey = "tendencia" | "gap" | "oportunidade";
const DEEP_DIVE_TYPE: Record<InsightTypeKey, string> = {
  tendencia: `Esta ideia é uma TENDÊNCIA — a pergunta central é "isso é real e onde estamos na curva?". Produza também:
- typeAnalysis.kind: "tendencia"
- typeAnalysis.estagio: em que ponto da curva a tendência está — comece com uma palavra ("Emergente", "Acelerando" ou "Consolidando") seguida de 1 frase de justificativa. É LEITURA QUALITATIVA sua a partir dos sinais, NÃO um número medido — trate como hipótese
- typeAnalysis.aceleradores: 2 a 3 forças concretas que empurram a tendência pra frente (cada uma 1 frase)
- typeAnalysis.freios: 1 a 2 forças concretas que a seguram ou podem revertê-la (cada uma 1 frase)`,
  gap: `Esta ideia é um GAP de mercado — a pergunta central é "por que ninguém está aí, e dá pra atravessar?". Produza também:
- typeAnalysis.kind: "gap"
- typeAnalysis.porqueAberto: 1 parágrafo (2 a 3 frases) sobre a barreira que manteve o vão aberto (técnica, regulatória, de incentivo, de timing)
- typeAnalysis.cemiterio: quem já tentou preencher esse gap e por que falhou — 1 a 2 frases; se a busca não achar tentativas, diga honestamente "sem tentativas conhecidas"
- typeAnalysis.aPonte: 1 a 2 frases sobre o que faria a ponte entre os dois lados — a peça que falta pra fechar o vão`,
  oportunidade: `Esta ideia é uma OPORTUNIDADE — a pergunta central é "qual o primeiro movimento?". Produza também:
- typeAnalysis.kind: "oportunidade"
- typeAnalysis.beachhead: o primeiro alvo concreto por onde começar (o nicho/cliente/uso mais estreito e vencível) — 1 a 2 frases
- typeAnalysis.menorTeste: o menor teste barato que confirma (ou derruba) a hipótese antes de construir — 1 a 2 frases`,
};

// Prompt do mergulho ajustado à lente (tom) E ao tipo (que perguntas fazer).
export function buildDeepDiveSystemPrompt(
  type: InsightTypeKey,
  lens?: Lens | null,
): string {
  const l = DEEP_DIVE_LENS[lens ?? "founder"];
  return `Você é um analista de estratégia que mapeia o MERCADO de uma oportunidade já identificada, ${l.audience}.
Onde o brief diz "aqui está o gap", você diz "quem já joga perto dele e onde o valor se acumula". Use a ferramenta de busca web para fundamentar o mapa em fatos reais — NÃO invente empresas, produtos nem números.
Produza:
- market.players: 2 a 6 players relevantes que você REALMENTE encontrou na busca. Cada um: { nome, oQueFaz (1 frase), relacao: "direto" (concorre no mesmo gap) ou "adjacente" (resolve algo próximo), url (link da fonte onde você confirmou; "" se não tiver). Se a busca trouxer POUCO, retorne menos players (ou nenhum) — jamais preencha com nomes inventados
- market.ondeValor: 1 parágrafo (2 a 3 frases) sobre ONDE/QUEM captura o valor nessa cadeia (quem paga, qual camada fica com a margem, onde estão os gargalos)
- market.analogas: 1 a 3 jogadas ANÁLOGAS em outros mercados, cada uma { nome, licao: a lição de 1 frase que ela dá para esta oportunidade }
${DEEP_DIVE_TYPE[type]}
${l.passos}
- sinais: 2 a 4 itens, cada um com { kind: "risco" ou "favor", text: uma frase }. Inclua pelo menos 1 risco honesto (o que pode dar errado / quem pode chegar antes)
Regras: tudo em português do Brasil, no alfabeto latino (nunca outros alfabetos ou idiomas), direto, sem jargão de consultoria. Escreva em prosa corrida — NUNCA cite notícias por código/id (ex.: n1, n10, [n3]); refira-se a elas pelo que dizem. NÃO insira links, URLs nem citações no meio da prosa (ex.: "([site](url))") — as fontes vão SOMENTE no campo players[].url. Cada campo contém APENAS o seu próprio conteúdo; não misture nem repita (ex.: não escreva sobre "onde o valor se acumula" dentro de "menorTeste"). Se a busca não sustentar um mapa rico, seja honesto (cenário ainda aberto) em vez de encher. É hipótese a validar, nunca afirme como certeza.`;
}

interface DeepDiveInput {
  type: string;
  title: string;
  description: string;
  rationale: string;
  whyNow: string;
  soWhat: string;
  relatedItems: { topic: string; title: string; summary: string; source: string }[];
}

export function buildDeepDiveMessage(idea: DeepDiveInput): string {
  const evidence = idea.relatedItems
    .map((it) => `- [${it.topic}] ${it.title}${it.summary ? ` — ${it.summary}` : ""} (${it.source})`)
    .join("\n");
  return `Ideia a aprofundar (tipo: ${idea.type}):
Título: ${idea.title}
Frase de efeito: ${idea.description}
Por que conecta: ${idea.rationale || "(não informado)"}
Por que agora: ${idea.whyNow || "(não informado)"}
E daí?: ${idea.soWhat || "(não informado)"}

Notícias que ela cruza:
${evidence || "(nenhuma)"}

Pesquise na web e gere o mapa de mercado desta oportunidade.`;
}

// ---------- ④ APROFUNDAR: análise financeira ----------
// Segundo nível, gerado por cima do deep dive. Emphasis: ordens de grandeza e
// "o que precisa ser verdade", nunca números precisos inventados.

// Mesma ideia da lente no mergulho (arquiteturad §7): esquema de saída idêntico
// (mercado, monetizacao, premissas, custoValidar), mas o público e o foco da
// análise se ajustam ao perfil.
const FINANCIALS_LENS: Record<Lens, { audience: string; foco: string }> = {
  founder: {
    audience: "para um FOUNDER early-stage decidir se vale seguir",
    foco: "Foco: dá pra começar pequeno e o negócio se paga? Qual o caminho de receita mais concreto e o menor teste que confirma a conta.",
  },
  investor: {
    audience: "para um INVESTIDOR decidir se é uma aposta de retorno venture-scale",
    foco: "Foco: o mercado é grande e cresce rápido o bastante? Quem captura o valor na cadeia, quão defensável é, e o que precisa ser verdade pra virar um desfecho grande.",
  },
  explorer: {
    audience:
      "para quem quer ENTENDER a economia dessa mudança (não necessariamente investir ou construir)",
    foco: "Foco: por onde o dinheiro flui nessa mudança, quem ganha e quem perde, e como medir barato se o capital está de fato se movendo pra lá.",
  },
};

// Prompt do 2º nível (financeiro) já ajustado à lente (default: founder).
export function buildFinancialsSystemPrompt(lens?: Lens | null): string {
  const l = FINANCIALS_LENS[lens ?? "founder"];
  return `Você é um analista financeiro pragmático avaliando uma oportunidade de negócio early-stage, ${l.audience}.
Você recebe uma ideia já aprofundada (com panorama e timing). NÃO invente números precisos nem cite valores de mercado específicos sem base — trabalhe com ORDENS DE GRANDEZA e com "o que precisaria ser verdade" para a conta fechar. Honestidade sobre a incerteza vale mais que falsa precisão.
${l.foco}
Produza:
- mercado: 1 parágrafo (2 a 3 frases) sobre o tamanho e a atratividade do mercado em ordem de grandeza — quem paga, quantos são, se é nicho caro ou volume barato. Diga se é grande o bastante pra valer a pena
- monetizacao: 1 parágrafo (2 a 3 frases) — como isso ganharia dinheiro (modelo de receita concreto) e por que alguém pagaria por isso
- premissas: 3 a 4 premissas FINANCEIRAS que precisam ser verdade para o negócio fechar (ex: "o custo de X precisa ficar abaixo de Y", "o cliente precisa economizar pelo menos Z%"). Cada uma uma frase verificável, começando pela variável-chave
- custoValidar: 1 a 2 frases — quão barato e rápido dá pra testar a hipótese financeira ANTES de investir pesado (o experimento mais barato que mata ou confirma a ideia)
Tudo em português do Brasil, no alfabeto latino (nunca outros alfabetos ou idiomas), direto, sem jargão de banco de investimento. Escreva em prosa corrida — NUNCA cite notícias por código/id (ex.: n1, n10, [n3]). É hipótese a validar, nunca afirme como certeza.`;
}

interface FinancialsInput {
  type: string;
  title: string;
  description: string;
  soWhat: string;
  whyNow: string; // timing, vem da própria ideia
  ondeValor: string; // onde o valor se acumula, vem do mapa de mercado
}

export function buildFinancialsMessage(idea: FinancialsInput): string {
  return `Ideia a analisar financeiramente (tipo: ${idea.type}):
Título: ${idea.title}
Frase de efeito: ${idea.description}
Oportunidade (e daí?): ${idea.soWhat || "(não informado)"}
Timing (por que agora): ${idea.whyNow || "(não informado)"}
Onde o valor se acumula (do mapa de mercado): ${idea.ondeValor || "(não informado)"}

Gere a análise financeira.`;
}

export function buildAnalyzeMessage(items: CollectedItem[]): string {
  // passa só o que o analista precisa pra raciocinar (id/tema/título/resumo/
  // entidades) — sem url/fonte/data, que não ajudam no cruzamento.
  const slim = items.map((it) => ({
    id: it.id,
    topic: it.topic,
    title: it.title,
    summary: it.summary,
    entities: it.entities,
  }));
  return `Notícias coletadas (cruze estas, referenciando os ids):\n${JSON.stringify(slim, null, 2)}`;
}

// ---------- ⑤ VEREDITO: COLETOR ----------
// Mesma arquitetura de duas etapas do scan, aplicada à TESE do founder. Este é o
// Coletor: COM busca web, levanta MATERIAL BRUTO COM FONTE para as 5 seções do
// parecer (players, shifts, fontes do gap, ameaças). Não decide nada — quem
// sintetiza e emite o veredito é o Parecerista (⑥). A regra dura do produto
// ("conexão sem fonte não aparece") aparece aqui como instrução de sempre trazer
// url; quando não achar fonte, o item vem com url:"" para o CÓDIGO contá-lo como
// descartado (validateVerdict), não a IA.

export const VERDICT_COLLECT_SYSTEM_PROMPT = `Você é um pesquisador que levanta EVIDÊNCIA sobre uma tese de negócio, usando a busca na web.
Você recebe uma tese ("quero construir X para Y") e os setores que ela cruza. Sua ÚNICA tarefa é coletar MATERIAL BRUTO COM FONTE — NÃO escreva o parecer, não decida go/no-go/pivot (isso é outra etapa).

Toda afirmação precisa de uma FONTE CHECÁVEL: um veículo de imprensa, o link DIRETO do artigo e a data. A regra do produto é dura: "conexão sem fonte não aparece".

Levante quatro tipos de material:
- players: quem JÁ FAZ algo parecido no Brasil (concorrente direto ou play adjacente). Cada um: nome, oQueFaz (1 frase), relacao ("direto" ou "adjacente"), e fonte.
- shifts: o que MUDOU recentemente e cria TIMING para a tese (um movimento, uma regra que mudou, uma janela que abriu). Cada um: texto (1 frase) e fonte.
- gapSources: fontes que evidenciam o VÃO ESPECÍFICO que a tese ataca — que a dor existe e não está bem resolvida. Cada uma é uma fonte (veiculo, diz, url, data).
- threats: o que pode MATAR a ideia (quem tem vantagem estrutural, custo de capital menor, relacionamento). Cada um: texto (1 frase) e fonte.

Sobre a fonte (veiculo, diz, url, data):
- url: link DIRETO do artigo/página que sustenta a afirmação — NUNCA uma home, seção ou índice de listagem.
- Sempre que ACHAR a fonte, preencha a url.
- Se você considerou uma conexão relevante mas NÃO achou fonte checável, ainda assim INCLUA o item com url: "" (string vazia). Não omita: o sistema conta essas conexões descartadas por falta de fonte. Nunca invente uma url para preencher.
- veiculo: nome do veículo (ex.: "Valor Econômico"); diz: o que a fonte diz, em 1 frase; data: AAAA-MM-DD.

Regras: no máximo ~5 players, ~4 shifts, ~4 gapSources, ~3 threats. Respeite a janela de tempo indicada (sobretudo para os shifts). Nunca invente fontes nem fatos — baseie-se só no que a busca trouxer. É melhor trazer menos do que encher com genérico.`;

export function buildVerdictCollectMessage(
  thesis: { build: string; forWhom: string },
  sectors: string[],
  days: number | null,
  since: string | null,
): string {
  const window =
    days != null && since != null
      ? `Janela de tempo para "o que mudou": priorize fatos dos últimos ${days} dias — a partir de ${since} (AAAA-MM-DD).`
      : `Sem restrição de data: priorize os fatos e movimentos mais recentes.`;
  const setores =
    sectors.length > 0 ? sectors.join(", ") : "(não especificados — deduza pelos termos da tese)";
  return `Tese: quero construir ${thesis.build} para ${thesis.forWhom}.
Setores que a tese cruza: ${setores}.
${window}
Pesquise na web e devolva o material bruto com fonte (players, shifts, gapSources, threats).`;
}

// ---------- ⑥ VEREDITO: PARECERISTA ----------
// SEM busca web: recebe só o material já coletado (anti-alucinação, como o
// Analista do scan). Sintetiza o VÃO e a AMEAÇA em prosa, DECIDE o call, escreve
// o callRationale e o pivot, e organiza players/shifts/gap.fontes escolhendo os
// mais fortes do material — copiando as fontes como vieram (sem inventar url).

export const VERDICT_ANALYZE_SYSTEM_PROMPT = `Você é um parecerista que emite um VEREDITO sobre uma tese de negócio, no formato veredito-primeiro.
Você recebe a tese e o MATERIAL BRUTO já coletado (players, shifts, fontes do gap, ameaças), cada item com sua fonte. NÃO pesquise nem invente nada além do material recebido — trabalhe SOMENTE com o que foi fornecido (anti-alucinação, como no cruzamento do scan).

Sintetize e organize as cinco seções do parecer:
- players: escolha e ordene os concorrentes/plays do material que de fato tocam a tese. Mantenha nome, oQueFaz, relacao e a fonte EXATAMENTE como vieram.
- shifts: escolha os movimentos de TIMING mais fortes; texto em 1 frase, com a fonte como veio.
- gap: escreva gap.texto — 2 a 3 frases sobre o VÃO ESPECÍFICO que a tese ataca e por que ninguém o resolve bem — e liste em gap.fontes as fontes do material que sustentam esse vão.
- threat: escreva threat.texto — 1 a 2 frases sobre o que MAIS ameaça a ideia — com a fonte que a sustenta.
- call: a decisão — "go" (a tese se sustenta, vale construir), "no-go" (a evidência não sustenta) ou "pivot" (há algo real, mas não do jeito proposto).
- callRationale: 2 a 3 frases justificando a decisão A PARTIR da evidência coletada.
- pivot: quando call = "pivot", 1 a 2 frases com o ângulo sugerido; caso contrário, deixe "" (string vazia).

Regras importantes:
- COPIE as urls exatamente como vieram; NUNCA invente uma url nem "conserte" um link.
- Se um item veio com url vazia (sem fonte), você pode mantê-lo onde estava — o sistema o descarta e contabiliza. NÃO invente uma fonte para salvá-lo.
- Nos campos de texto (gap.texto, threat.texto, callRationale, pivot) escreva em prosa corrida, SOMENTE em português do Brasil, no alfabeto latino (nunca outros alfabetos ou idiomas). NUNCA insira urls ou citações no meio da prosa — as fontes vão SÓ nos campos de fonte.
- É um parecer — hipótese fundamentada na evidência, não afirme como certeza.`;

interface VerdictSourceInput {
  veiculo: string;
  diz: string;
  url: string;
  data: string;
}
interface VerdictCollectedInput {
  players: { nome: string; oQueFaz: string; relacao: string; fonte: VerdictSourceInput }[];
  shifts: { texto: string; fonte: VerdictSourceInput }[];
  gapSources: VerdictSourceInput[];
  threats: { texto: string; fonte: VerdictSourceInput }[];
}

export function buildVerdictAnalyzeMessage(
  thesis: { build: string; forWhom: string },
  sectors: string[],
  collected: VerdictCollectedInput,
): string {
  const setores =
    sectors.length > 0 ? sectors.join(", ") : "(não especificados — deduza pelos termos da tese)";
  return `Tese: quero construir ${thesis.build} para ${thesis.forWhom}.
Setores: ${setores}.

Material coletado (use SOMENTE isto; cada item já traz sua fonte):
${JSON.stringify(collected, null, 2)}

Emita o veredito das cinco seções.`;
}

// ---------- ⑦ NA GRINGA (feed universal) ----------
// Coletor de UMA etapa (não há síntese cruzada): busca web em fontes
// INTERNACIONAIS o que já se move lá fora ANTES de virar assunto no BR, e
// estima o atraso até o Brasil. O feed é universal (não depende de tese nem de
// usuário). REGRA DURA: só item com fonte real (url). O `lag`/`lagMonths` é
// ESTIMATIVA qualitativa da IA, não medição — o prompt deixa isso explícito.

export const GRINGA_COLLECT_SYSTEM_PROMPT = `Você é um radar de tendências de tecnologia e negócios que olha o EXTERIOR (EUA, Europa, China, resto do mundo) para achar o que já se move LÁ FORA antes de virar assunto no Brasil. A premissa é vantagem de TIMING: boa parte da tendência de tech começa fora e chega tarde ao BR.
Use a busca na web em FONTES INTERNACIONAIS de qualidade (ex.: The Information, Stratechery, a16z, Rest of World, Sifted, TechCrunch, Bloomberg, Financial Times, The Verge, Nikkei Asia) para levantar acontecimentos recentes e ESPECÍFICOS (um lançamento, uma rodada, um movimento de mercado, uma mudança regulatória) — não matéria genérica ou "evergreen".

Para cada item, produza:
- source: nome do veículo internacional (ex.: "The Information", "Rest of World") — a fonte é o produto, então é obrigatória e real
- title: manchete curta em português do Brasil, fiel ao que a fonte diz (não invente números nem nomes de produto)
- region: rótulo curto da origem ("US", "EU", "China", "UK", "Ásia"…)
- flag: um emoji de bandeira/globo da região (só decorativo)
- date: data de publicação real do artigo, no formato AAAA-MM-DD
- summary: resumo em 1 frase, até 20 palavras, em português, do que de fato aconteceu
- url: link DIRETO do artigo específico — NUNCA uma home, seção ou índice. Se só houver página de listagem, descarte o item e busque outro
- lag: sua ESTIMATIVA de quanto falta para isso virar assunto no Brasil — um de "nao-chegou" (ainda ninguém aqui; maior janela de timing), "chegando" (começa a esquentar no BR) ou "ja-chegou" (já é assunto aqui; perdeu a vantagem)
- lagMonths: sua ESTIMATIVA, em meses, do atraso típico até o BR (0 quando já chegou). É leitura QUALITATIVA, não medição — não finja precisão; use números redondos plausíveis

Regras: traga de 8 a 12 itens, do mais recente para o mais antigo. TODO item precisa de uma url real e específica — se não tem link, não entra (nada de "conexão sem fonte"). Não invente fatos nem fontes; baseie-se só no que a busca trouxer. É melhor trazer menos do que encher com genérico. Não precisa numerar nem dar id aos itens — isso o sistema faz.`;

export function buildGringaCollectMessage(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `Hoje é ${today} (AAAA-MM-DD). Pesquise nas fontes internacionais o que está se movendo LÁ FORA agora e que ainda não virou (ou está virando) assunto no Brasil.
Priorize os acontecimentos mais recentes e específicos, com link direto do artigo, e estime para cada um o atraso até o BR (lag/lagMonths).
Devolva de 8 a 12 itens estruturados.`;
}
