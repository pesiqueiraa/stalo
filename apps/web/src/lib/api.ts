import { MAX_TOPICS, type Lens, type NewsItem, type SavedIdea, type ScanResult, type Topic } from "@stalo/shared";
import { readLens, readTopics, writeLens, writeTopics } from "./storage";

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
  return (await res.json()) as ScanResult;
}

export async function fetchLatestScan(): Promise<{
  result: ScanResult | null;
  createdAt: string | null;
}> {
  const res = await fetch("/api/scan/latest");
  if (!res.ok) throw new Error(await parseError(res, "Falha ao carregar o último scan."));
  return (await res.json()) as { result: ScanResult | null; createdAt: string | null };
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
  const res = await fetch("/api/ideas");
  if (!res.ok) throw new Error(await parseError(res, "Falha ao carregar ideias."));
  return (await res.json()) as SavedIdea[];
}

export async function createIdea(payload: NewIdeaPayload): Promise<SavedIdea> {
  const res = await fetch("/api/ideas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res, "Falha ao salvar ideia."));
  return (await res.json()) as SavedIdea;
}

export async function deleteIdea(id: string): Promise<void> {
  const res = await fetch(`/api/ideas/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await parseError(res, "Falha ao remover ideia."));
}

// ---------- settings (lente do workspace) ----------

export async function fetchSettings(): Promise<{ lens: Lens | null }> {
  return { lens: readLens() };
}

export async function saveLens(lens: Lens): Promise<void> {
  writeLens(lens);
}

// "Mergulhar": gera (ou recupera do cache) o relatório fundo e devolve a ideia
// atualizada, já com o deepDive preenchido.
export async function requestDeepDive(id: string): Promise<SavedIdea> {
  const res = await fetch(`/api/ideas/${id}/dive`, { method: "POST" });
  if (!res.ok) throw new Error(await parseError(res, "Falha ao aprofundar a ideia."));
  return (await res.json()) as SavedIdea;
}

// "Aprofundar": gera (ou recupera do cache) a análise financeira do 2º nível.
export async function requestFinancials(id: string): Promise<SavedIdea> {
  const res = await fetch(`/api/ideas/${id}/financials`, { method: "POST" });
  if (!res.ok) throw new Error(await parseError(res, "Falha ao gerar a análise financeira."));
  return (await res.json()) as SavedIdea;
}
