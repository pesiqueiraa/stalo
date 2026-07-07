import type { Lens, NewsItem, SavedIdea, ScanResult, Topic } from "@stalo/shared";

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
  const res = await fetch("/api/topics");
  if (!res.ok) throw new Error(await parseError(res, "Falha ao carregar temas."));
  return (await res.json()) as Topic[];
}

export async function createTopic(name: string): Promise<Topic> {
  const res = await fetch("/api/topics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(await parseError(res, "Falha ao adicionar tema."));
  return (await res.json()) as Topic;
}

export async function deleteTopic(id: string): Promise<void> {
  const res = await fetch(`/api/topics/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await parseError(res, "Falha ao remover tema."));
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
  const res = await fetch("/api/settings");
  if (!res.ok) throw new Error(await parseError(res, "Falha ao carregar preferências."));
  return (await res.json()) as { lens: Lens | null };
}

export async function saveLens(lens: Lens): Promise<void> {
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lens }),
  });
  if (!res.ok) throw new Error(await parseError(res, "Falha ao salvar a lente."));
}

// Destino após autenticar: quem ainda não configurou (sem setores e sem lente)
// vai pro onboarding; os demais, pro radar. Mesmo critério do /auth/callback do
// OAuth, aqui no client para o login por e-mail.
export async function postAuthDestination(): Promise<"/onboarding" | "/radar"> {
  try {
    const [topics, settings] = await Promise.all([fetchTopics(), fetchSettings()]);
    return topics.length === 0 && !settings.lens ? "/onboarding" : "/radar";
  } catch {
    return "/radar";
  }
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
