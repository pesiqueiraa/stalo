// Lista curada de feeds RSS que alimentam a newsletter, por (origem × setor).
// Fonte da coleta: validação manual + WebFetch (ver nota "newsletter-coleta-de-
// feeds" no Maestri). Duas classes:
//   - "nativo": feed do próprio veículo (confirmado que abre XML com itens
//     recentes). Cobre hoje só IA/Fintech/Energia (setores prioritários).
//   - "google-news": busca por tópico do Google News RSS — cobre TODOS os 12
//     setores; é a rede de cobertura que garante todo setor no dia 1.
//
// IMPORTANTE: `setor` DEVE bater exatamente com SUGGESTED_SECTORS
// (apps/web/src/lib/sectors.ts) — é a chave que liga a escolha do assinante ao
// feed. (Quando SUGGESTED_SECTORS virar tipo compartilhado em @stalo/shared,
// trocar as strings soltas por ele.)
//
// Nuance conhecida (refinar depois): alguns nativos de BR (Tecnoblog, Canaltech,
// InfoMoney) são de tech/negócios em geral, não puros do setor — servem como
// proxy do setor; a precisão fina vem do feed google-news correspondente.

export type Origem = "BR" | "GRINGA";
export type FeedTipo = "nativo" | "google-news";

export interface FeedSource {
  origem: Origem;
  setor: string; // === SUGGESTED_SECTORS
  veiculo: string;
  url: string;
  tipo: FeedTipo;
}

// sufixos de localização do Google News RSS
const GN = "https://news.google.com/rss/search?q=";
const GN_BR = "&hl=pt-BR&gl=BR&ceid=BR:pt-419";
const GN_US = "&hl=en-US&gl=US&ceid=US:en";

export const FEEDS: FeedSource[] = [
  // ---------- nativos verificados (IA / Fintech / Energia) ----------
  // IA
  { origem: "BR", setor: "Inteligência Artificial", veiculo: "Tecnoblog", url: "https://tecnoblog.net/feed/", tipo: "nativo" },
  { origem: "BR", setor: "Inteligência Artificial", veiculo: "Canaltech", url: "https://canaltech.com.br/rss/", tipo: "nativo" },
  { origem: "GRINGA", setor: "Inteligência Artificial", veiculo: "TechCrunch (IA)", url: "https://techcrunch.com/category/artificial-intelligence/feed/", tipo: "nativo" },
  { origem: "GRINGA", setor: "Inteligência Artificial", veiculo: "VentureBeat (IA)", url: "https://venturebeat.com/category/ai/feed/", tipo: "nativo" },
  // Fintech
  { origem: "BR", setor: "Fintech", veiculo: "InfoMoney", url: "https://www.infomoney.com.br/feed/", tipo: "nativo" },
  { origem: "BR", setor: "Fintech", veiculo: "NeoFeed", url: "https://neofeed.com.br/feed/", tipo: "nativo" },
  { origem: "BR", setor: "Fintech", veiculo: "Finsiders Brasil", url: "https://finsidersbrasil.com.br/feed/", tipo: "nativo" },
  { origem: "GRINGA", setor: "Fintech", veiculo: "TechCrunch (fintech)", url: "https://techcrunch.com/category/fintech/feed/", tipo: "nativo" },
  { origem: "GRINGA", setor: "Fintech", veiculo: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/", tipo: "nativo" },
  // Energia (só gringa por ora — epbr não funcionou; Energia BR fica no google-news)
  { origem: "GRINGA", setor: "Energia", veiculo: "Utility Dive", url: "https://www.utilitydive.com/feeds/news/", tipo: "nativo" },
  { origem: "GRINGA", setor: "Energia", veiculo: "Latitude Media", url: "https://www.latitudemedia.com/rss", tipo: "nativo" },

  // ---------- Google News RSS (cobre os 12 setores × BR/gringa) ----------
  // Inteligência Artificial
  { origem: "BR", setor: "Inteligência Artificial", veiculo: "Google News", url: `${GN}inteligencia+artificial+Brasil+when:7d${GN_BR}`, tipo: "google-news" },
  { origem: "GRINGA", setor: "Inteligência Artificial", veiculo: "Google News", url: `${GN}(artificial+intelligence+OR+AI)+when:7d${GN_US}`, tipo: "google-news" },
  // Energia
  { origem: "BR", setor: "Energia", veiculo: "Google News", url: `${GN}(energia+eletrica+OR+setor+eletrico)+Brasil+when:7d${GN_BR}`, tipo: "google-news" },
  { origem: "GRINGA", setor: "Energia", veiculo: "Google News", url: `${GN}(power+grid+OR+electricity+OR+energy)+when:7d${GN_US}`, tipo: "google-news" },
  // Fintech
  { origem: "BR", setor: "Fintech", veiculo: "Google News", url: `${GN}(fintech+OR+Drex+OR+open+finance)+Brasil+when:7d${GN_BR}`, tipo: "google-news" },
  { origem: "GRINGA", setor: "Fintech", veiculo: "Google News", url: `${GN}(fintech+OR+payments+OR+stablecoin)+when:7d${GN_US}`, tipo: "google-news" },
  // Biotecnologia
  { origem: "BR", setor: "Biotecnologia", veiculo: "Google News", url: `${GN}(biotecnologia+OR+biotech)+Brasil+when:7d${GN_BR}`, tipo: "google-news" },
  { origem: "GRINGA", setor: "Biotecnologia", veiculo: "Google News", url: `${GN}(biotech+OR+biotechnology)+when:7d${GN_US}`, tipo: "google-news" },
  // Semicondutores
  { origem: "BR", setor: "Semicondutores", veiculo: "Google News", url: `${GN}(semicondutores+OR+chips)+Brasil+when:7d${GN_BR}`, tipo: "google-news" },
  { origem: "GRINGA", setor: "Semicondutores", veiculo: "Google News", url: `${GN}(semiconductors+OR+chips)+when:7d${GN_US}`, tipo: "google-news" },
  // Cibersegurança
  { origem: "BR", setor: "Cibersegurança", veiculo: "Google News", url: `${GN}(ciberseguranca+OR+seguranca+cibernetica)+Brasil+when:7d${GN_BR}`, tipo: "google-news" },
  { origem: "GRINGA", setor: "Cibersegurança", veiculo: "Google News", url: `${GN}cybersecurity+when:7d${GN_US}`, tipo: "google-news" },
  // Robótica
  { origem: "BR", setor: "Robótica", veiculo: "Google News", url: `${GN}(robotica+OR+automacao+industrial)+Brasil+when:7d${GN_BR}`, tipo: "google-news" },
  { origem: "GRINGA", setor: "Robótica", veiculo: "Google News", url: `${GN}(robotics+OR+automation)+when:7d${GN_US}`, tipo: "google-news" },
  // Espaço
  { origem: "BR", setor: "Espaço", veiculo: "Google News", url: `${GN}(setor+espacial+OR+satelite)+Brasil+when:7d${GN_BR}`, tipo: "google-news" },
  { origem: "GRINGA", setor: "Espaço", veiculo: "Google News", url: `${GN}(space+industry+OR+satellite)+when:7d${GN_US}`, tipo: "google-news" },
  // Clima
  { origem: "BR", setor: "Clima", veiculo: "Google News", url: `${GN}(clima+OR+transicao+energetica)+Brasil+when:7d${GN_BR}`, tipo: "google-news" },
  { origem: "GRINGA", setor: "Clima", veiculo: "Google News", url: `${GN}(climate+tech+OR+energy+transition)+when:7d${GN_US}`, tipo: "google-news" },
  // Saúde digital
  { origem: "BR", setor: "Saúde digital", veiculo: "Google News", url: `${GN}(saude+digital+OR+healthtech)+Brasil+when:7d${GN_BR}`, tipo: "google-news" },
  { origem: "GRINGA", setor: "Saúde digital", veiculo: "Google News", url: `${GN}(digital+health+OR+healthtech)+when:7d${GN_US}`, tipo: "google-news" },
  // Mobilidade
  { origem: "BR", setor: "Mobilidade", veiculo: "Google News", url: `${GN}(mobilidade+OR+veiculo+eletrico)+Brasil+when:7d${GN_BR}`, tipo: "google-news" },
  { origem: "GRINGA", setor: "Mobilidade", veiculo: "Google News", url: `${GN}(mobility+OR+electric+vehicle+OR+EV)+when:7d${GN_US}`, tipo: "google-news" },
  // Web3
  { origem: "BR", setor: "Web3", veiculo: "Google News", url: `${GN}(web3+OR+cripto+OR+blockchain)+Brasil+when:7d${GN_BR}`, tipo: "google-news" },
  { origem: "GRINGA", setor: "Web3", veiculo: "Google News", url: `${GN}(web3+OR+crypto+OR+blockchain)+when:7d${GN_US}`, tipo: "google-news" },
];

// feeds de um par (setor, origem) — usado pela ingestão pra montar a seção.
export function feedsFor(setor: string, origem: Origem): FeedSource[] {
  return FEEDS.filter((f) => f.setor === setor && f.origem === origem);
}
