// PROTÓTIPO SÓ-FRONTEND: feed "Últimas atualizações na gringa" mockado no
// client. A premissa do produto é vantagem de timing — boa parte da tendência
// de tech começa lá fora e chega tarde no Brasil. Este feed mostra o que já se
// move na gringa ANTES de virar assunto aqui. No produto real viria de uma
// busca contínua a fontes internacionais (o ponto de plugue seria o backend);
// aqui o conteúdo é ilustrativo mas plausível, só pra ver o formato.

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
  lagMonths: number; // atraso típico estimado até o Brasil, em meses
  url: string;
}

export const LAG_LABEL: Record<GringaLag, string> = {
  "nao-chegou": "Ainda não chegou ao BR",
  chegando: "Chegando ao BR",
  "ja-chegou": "Já chegou ao BR",
};

// 9 itens ilustrativos, do mais recente pro mais antigo. Datas em 2026 pra soar
// recente em relação ao "hoje" do protótipo. Links apontam pra raiz do veículo
// (são exemplos, não artigos reais).
export const GRINGA_ITEMS: GringaItem[] = [
  {
    id: "g1",
    source: "The Information",
    title: "AI SDRs assumem o topo do funil de vendas",
    region: "US",
    flag: "🇺🇸",
    date: "2026-06-24",
    summary:
      "Startups já trocam o primeiro nível de pré-vendas por agentes que qualificam lead sozinhos.",
    lag: "nao-chegou",
    lagMonths: 9,
    url: "https://www.theinformation.com",
  },
  {
    id: "g2",
    source: "Stratechery",
    title: "Inferência barata muda quem lucra com IA",
    region: "US",
    flag: "🇺🇸",
    date: "2026-06-18",
    summary:
      "Modelos pequenos rodando no próprio aparelho derrubam o custo por chamada e mexem na margem do SaaS.",
    lag: "chegando",
    lagMonths: 6,
    url: "https://stratechery.com",
  },
  {
    id: "g3",
    source: "a16z",
    title: "Voice agents viram a camada padrão de suporte",
    region: "US",
    flag: "🇺🇸",
    date: "2026-06-05",
    summary:
      "Atendimento por voz com agente deixa de ser piloto e vira default em fintech e seguro.",
    lag: "chegando",
    lagMonths: 7,
    url: "https://a16z.com",
  },
  {
    id: "g4",
    source: "Rest of World",
    title: "Super-app de agro fecha crédito dentro do chat",
    region: "China",
    flag: "🇨🇳",
    date: "2026-05-29",
    summary:
      "Plataformas chinesas de insumo já liberam capital de giro pro produtor sem sair da conversa.",
    lag: "nao-chegou",
    lagMonths: 12,
    url: "https://restofworld.org",
  },
  {
    id: "g5",
    source: "Sifted",
    title: "Open finance europeu engole dados de seguro",
    region: "EU",
    flag: "🇪🇺",
    date: "2026-05-20",
    summary:
      "O que era open banking agora puxa histórico de apólice pra precificar crédito em tempo real.",
    lag: "chegando",
    lagMonths: 8,
    url: "https://sifted.eu",
  },
  {
    id: "g6",
    source: "TechCrunch",
    title: "Defense tech atrai fundo que fugia do setor",
    region: "UK",
    flag: "🇬🇧",
    date: "2026-05-08",
    summary: "VCs que vetavam defesa reabrem mandato e a categoria vira tese própria na Europa.",
    lag: "nao-chegou",
    lagMonths: 10,
    url: "https://techcrunch.com",
  },
  {
    id: "g7",
    source: "The Verge",
    title: "Wearable ganha aval pra ECG contínuo",
    region: "US",
    flag: "🇺🇸",
    date: "2026-04-27",
    summary:
      "Regulador libera monitoramento cardíaco de pulso 24/7 e abre espaço pra seguro-saúde por uso.",
    lag: "nao-chegou",
    lagMonths: 14,
    url: "https://www.theverge.com",
  },
  {
    id: "g8",
    source: "Bloomberg",
    title: "Stablecoin de tesouraria vira conta de PME",
    region: "US",
    flag: "🇺🇸",
    date: "2026-04-15",
    summary:
      "Empresas passam a manter caixa em stablecoin lastreada em título e pagar fornecedor direto dela.",
    lag: "chegando",
    lagMonths: 9,
    url: "https://www.bloomberg.com",
  },
  {
    id: "g9",
    source: "The Verge",
    title: "Passkeys viram o padrão de login sem senha",
    region: "Global",
    flag: "🌐",
    date: "2026-03-30",
    summary: "Grandes plataformas aposentam a senha; no Brasil os bancos já começaram a adotar.",
    lag: "ja-chegou",
    lagMonths: 3,
    url: "https://www.theverge.com",
  },
];
