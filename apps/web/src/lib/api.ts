import { MAX_TOPICS, type Lens, type NewsItem, type SavedIdea, type ScanResult, type Topic } from "@stalo/shared";
import { readIdeas, readLens, readScan, readTopics, writeIdeas, writeLens, writeScan, writeTopics } from "./storage";

// Cliente do backend do próprio app. O frontend fala só com estes endpoints,
// nunca direto com a API de IA nem com o banco (CLAUDE.md regra 1).

async function parseError(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    if (data?.error) return data.error;
  } catch {
    // resposta sem corpo JSON — mantém a mensagem genérica
  }
  return fallback;
}

// ---------- topics ----------

export async function fetchTopics(): Promise<Topic[]> {
  return readTopics();
}

export async function createTopic(name: string): Promise<Topic> {
  const limpo = name.trim();
  if (!limpo) throw new Error("Dê um nome ao tema.");

  const atuais = readTopics();
  if (atuais.length >= MAX_TOPICS) {
    throw new Error(`Máximo de ${MAX_TOPICS} temas por vez.`);
  }
  if (atuais.some((t) => t.name.toLowerCase() === limpo.toLowerCase())) {
    throw new Error("Esse tema já está na lista.");
  }

  const novo: Topic = { id: crypto.randomUUID(), name: limpo };
  writeTopics([...atuais, novo]);
  return novo;
}

export async function deleteTopic(id: string): Promise<void> {
  writeTopics(readTopics().filter((t) => t.id !== id));
}

// ---------- scan ----------

export async function requestScan(topics: string[], days: number | null): Promise<ScanResult> {
  const res = await fetch("/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topics, days }),
  });
  if (!res.ok) throw new Error(await parseError(res, "Falha ao buscar notícias."));
  const result = (await res.json()) as ScanResult;
  writeScan(result); // quem guarda agora é o navegador
  return result;
}

export async function fetchLatestScan(): Promise<{
  result: ScanResult | null;
  createdAt: string | null;
}> {
  return readScan();
}

// ---------- newsletter ----------

// Assina a newsletter (email + setores) via POST /api/newsletter. Só resolve em
// sucesso; em erro lança Error com mensagem pra UI (nunca falha em silêncio).
export async function subscribeNewsletter(email: string, sectors: string[]): Promise<void> {
  const res = await fetch("/api/newsletter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, sectors }),
  });
  if (!res.ok) throw new Error(await parseError(res, "Falha ao concluir a inscrição."));
}

// ---------- saved ideas ----------

export interface NewIdeaPayload {
  insightRef: string;
  type: SavedIdea["type"];
  title: string;
  description: string;
  rationale: string;
  whyNow: string;
  soWhat: string;
  notes: string;
  relatedItems: NewsItem[];
}

export async function fetchIdeas(): Promise<SavedIdea[]> {
  return readIdeas();
}

export async function createIdea(payload: NewIdeaPayload): Promise<SavedIdea> {
  const nova: SavedIdea = {
    ...payload,
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
    deepDive: null,
    financials: null,
  };
  writeIdeas([nova, ...readIdeas()]); // mais recente primeiro
  return nova;
}

export async function deleteIdea(id: string): Promise<void> {
  writeIdeas(readIdeas().filter((i) => i.id !== id));
}

// ---------- settings (lente do workspace) ----------

export async function fetchSettings(): Promise<{ lens: Lens | null }> {
  return { lens: readLens() };
}

export async function saveLens(lens: Lens): Promise<void> {
  writeLens(lens);
}

// "Mergulhar": gera (ou recupera do cache) o relatório fundo e devolve a ideia
// atualizada, já com o deepDive preenchido. O servidor não guarda mais nada —
// quem persiste é o navegador (writeIdeas), inclusive o cache: se já tem o
// mergulho novo (com análise por tipo), nem faz a requisição.
export async function requestDeepDive(idea: SavedIdea): Promise<SavedIdea> {
  if (idea.deepDive?.typeAnalysis) return idea;

  const res = await fetch("/api/dive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idea, lens: readLens() }),
  });
  if (!res.ok) throw new Error(await parseError(res, "Falha ao aprofundar a ideia."));
  const deepDive = (await res.json()) as SavedIdea["deepDive"];

  const atualizada = { ...idea, deepDive };
  writeIdeas(readIdeas().map((i) => (i.id === idea.id ? atualizada : i)));
  return atualizada;
}

// "Aprofundar": gera (ou recupera do cache) a análise financeira do 2º nível.
// Exige que a ideia já tenha sido mergulhada — o atalho abaixo evita a
// requisição que a rota recusaria com 409; a rota mantém a mesma checagem,
// porque o servidor não pode confiar que o cliente checou.
export async function requestFinancials(idea: SavedIdea): Promise<SavedIdea> {
  if (idea.financials) return idea;
  if (!idea.deepDive) throw new Error("Mergulhe na ideia antes de aprofundar no financeiro.");

  const res = await fetch("/api/financials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idea, lens: readLens() }),
  });
  if (!res.ok) throw new Error(await parseError(res, "Falha ao gerar a análise financeira."));
  const financials = (await res.json()) as SavedIdea["financials"];

  const atualizada = { ...idea, financials };
  writeIdeas(readIdeas().map((i) => (i.id === idea.id ? atualizada : i)));
  return atualizada;
}
