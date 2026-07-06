import type { Insight, NewsItem, ScanResult } from "@stalo/shared";

const CURATED_ITEMS: Record<string, NewsItem[]> = {
  "Inteligência Artificial": [
    {
      id: "n1",
      topic: "Inteligência Artificial",
      title: "OpenAI anuncia modelo capaz de rodar em chips de baixo consumo",
      summary: "Novo modelo promete cortar custo de inferência em data centers.",
      source: "TechCrunch",
      url: "https://techcrunch.com",
      entities: ["chips", "data center"],
      publishedAt: "2026-06-28",
    },
    {
      id: "n2",
      topic: "Inteligência Artificial",
      title: "Regulação europeia da IA entra em nova fase de fiscalização",
      summary: "Empresas terão de comprovar auditoria de modelos de alto risco até 2026.",
      source: "Reuters",
      url: "https://reuters.com",
      entities: ["regulação", "compliance"],
      publishedAt: "2026-06-20",
    },
  ],
  Energia: [
    {
      id: "n3",
      topic: "Energia",
      title: "Baterias de estado sólido começam a sair do laboratório",
      summary: "Fabricantes prometem baterias mais duráveis para veículos elétricos em 2027.",
      source: "Valor Econômico",
      url: "https://valor.globo.com",
      entities: ["baterias", "veículos elétricos"],
      publishedAt: "2026-06-18",
    },
    {
      id: "n4",
      topic: "Energia",
      title: "Data centers de IA pressionam demanda por energia renovável",
      summary: "Big techs assinam contratos recordes de energia limpa para sustentar IA.",
      source: "Bloomberg",
      url: "https://bloomberg.com",
      entities: ["energia renovável", "data center"],
      publishedAt: "2026-07-01",
    },
  ],
  Blockchain: [
    {
      id: "n5",
      topic: "Blockchain",
      title: "Bancos centrais testam moeda digital com contratos inteligentes",
      summary: "Piloto usa blockchain para liquidação instantânea entre instituições.",
      source: "Financial Times",
      url: "https://ft.com",
      entities: ["moeda digital", "compliance"],
      publishedAt: "2026-06-25",
    },
    {
      id: "n6",
      topic: "Blockchain",
      title: "Reguladores dos EUA avançam marco legal para criptoativos",
      summary: "Nova proposta busca clareza regulatória para exchanges e stablecoins.",
      source: "Reuters",
      url: "https://reuters.com",
      entities: ["regulação", "cripto"],
      publishedAt: "2026-06-30",
    },
  ],
  "Computação Quântica": [
    {
      id: "n7",
      topic: "Computação Quântica",
      title: "Startup anuncia chip quântico com correção de erro mais estável",
      summary: "Avanço reduz taxa de erro e aproxima uso comercial de computação quântica.",
      source: "MIT Technology Review",
      url: "https://technologyreview.com",
      entities: ["chips", "correção de erro"],
      publishedAt: "2026-06-22",
    },
    {
      id: "n8",
      topic: "Computação Quântica",
      title: "Bancos investem em pesquisa quântica para otimizar portfólios",
      summary: "Instituições financeiras exploram algoritmos quânticos para gestão de risco.",
      source: "Exame",
      url: "https://exame.com",
      entities: ["investimento", "finanças"],
      publishedAt: "2026-06-15",
    },
  ],
};

const CURATED_INSIGHTS: Insight[] = [
  {
    id: "i1",
    type: "tendencia",
    title: "Chips especializados viram gargalo comum entre IA e computação quântica",
    description:
      "Tanto modelos de IA quanto processadores quânticos dependem de avanços em chips, criando corrida por fornecedores especializados.",
    rationale:
      "A notícia sobre IA aponta escassez de GPUs; a de computação quântica descreve corrida por hardware criogênico. Os dois setores competem pela mesma cadeia de semicondutores de ponta — quem domina o processo de fabricação vira gargalo dos dois.",
    soWhat:
      "Vale mapear fornecedores de nicho na cadeia de chips (packaging, materiais) que atendam os dois mercados — um fornecedor pequeno pode virar peça crítica antes de aparecer no radar dos grandes.",
    related_items: ["n1", "n7"],
  },
  {
    id: "i2",
    type: "gap",
    title: "Regulação fragmentada entre IA, cripto e compliance financeiro",
    description:
      "Empresas enfrentam regras diferentes para IA e blockchain, sem padrão comum entre reguladores.",
    rationale:
      "A notícia de IA mostra o regulador exigindo explicabilidade; a de cripto, regras de rastreabilidade; a de compliance, auditoria de dados. Cada setor cria sua própria conformidade, mas ninguém oferece uma camada única que atenda os três.",
    soWhat:
      "Há espaço para uma ferramenta de compliance transversal (proveniência de dados + auditoria) que sirva IA e cripto ao mesmo tempo. Validar com uma fintech que opere nos dois mundos.",
    related_items: ["n2", "n6", "n5"],
  },
  {
    id: "i3",
    type: "oportunidade",
    title: "Energia limpa dedicada a data centers de IA",
    description:
      "Demanda crescente de energia por IA abre espaço para provedores especializados em energia renovável para data centers.",
    rationale:
      "A notícia de IA cita explosão no consumo de energia dos data centers; a de energia, sobra de capacidade renovável ociosa fora dos centros urbanos. As duas pontas não se encontram — falta quem conecte geração limpa barata à demanda faminta da IA.",
    soWhat:
      "Testar um modelo de data center modular colocado junto a parques solares/eólicos com energia ociosa. Começar conversando com um operador de energia que já tenha excedente.",
    related_items: ["n4", "n1"],
  },
];

function genericItemFor(topic: string, index: number): NewsItem {
  return {
    id: `n-mock-${index}`,
    topic,
    title: `${topic}: sinais iniciais de tração no mercado`,
    summary: `Ainda não há notícia mockada específica para "${topic}" — o scan real vai buscar dados de verdade.`,
    source: "Mock",
    url: "",
    entities: [],
    publishedAt: new Date().toISOString().slice(0, 10),
  };
}

/**
 * Simula o retorno do scan via Claude API (mesmo formato de `SYSTEM_PROMPT`
 * em artefatos/prototype.html), sem chamar nenhuma API de verdade.
 * Adicionar um tema chamado "erro" (case-insensitive) simula falha de scan,
 * útil para testar o banner de erro sem depender do backend.
 */
export async function mockScan(topics: string[]): Promise<ScanResult> {
  await new Promise((resolve) => setTimeout(resolve, 900));

  if (topics.some((t) => t.trim().toLowerCase() === "erro")) {
    throw new Error("Falha simulada de scan");
  }

  const items: NewsItem[] = [];
  topics.forEach((topic, index) => {
    const curated = CURATED_ITEMS[topic];
    if (curated) {
      items.push(...curated);
    } else {
      items.push(genericItemFor(topic, index));
    }
  });

  const itemIds = new Set(items.map((i) => i.id));
  const insights = CURATED_INSIGHTS.map((ins) => ({
    ...ins,
    related_items: ins.related_items.filter((id) => itemIds.has(id)),
  })).filter((ins) => ins.related_items.length >= 2);

  return { items, insights };
}
