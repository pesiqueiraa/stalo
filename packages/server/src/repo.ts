import "server-only";
import { sql } from "./db";
import type {
  DeepDive,
  Financials,
  Insight,
  Lens,
  NewsItem,
  NewsletterCombo,
  NewsletterEdition,
  SavedIdea,
  ScanResult,
  Topic,
} from "@stalo/shared";

// Camada de acesso a dados: TODO o SQL do app vive aqui, mapeando as linhas
// do Postgres (snake_case) para os tipos do frontend (camelCase). O schema é
// artefatos/arquiteturad.md §4 / frontend/db/schema.sql (CLAUDE.md regra 3).
//
// ISOLAMENTO POR WORKSPACE (produto.md §2): toda função recebe um `wid`
// (workspace anônimo do visitante, vindo do cookie via getWorkspaceId no web) e
// escopa o SQL por ele — nenhum dado vaza entre visitantes. As tabelas topics /
// scans / saved_ideas têm a coluna workspace_id; news_items/insights herdam o
// escopo via scan_id (sempre acessadas a partir de um scan já filtrado). Quando
// contas reais (magic link) entrarem, `wid` vira o user_id sem mudar as queries.

export const MAX_TOPICS = 5;

// DATE/TIMESTAMPTZ voltam como Date do postgres.js — normaliza para string.
function toDateStr(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return typeof value === "string" ? value.slice(0, 10) : "";
}
function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : new Date().toISOString();
}

// ---------- topics ----------

export async function listTopics(wid: string): Promise<Topic[]> {
  const rows = await sql<{ id: string; name: string }[]>`
    SELECT id, name FROM topics WHERE workspace_id = ${wid} ORDER BY created_at ASC
  `;
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

export async function countTopics(wid: string): Promise<number> {
  const [row] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM topics WHERE workspace_id = ${wid}
  `;
  return row.count;
}

// Retorna o tema criado, ou null se o nome já existe (case-insensitive) nesse workspace.
export async function addTopic(wid: string, name: string): Promise<Topic | null> {
  const [dup] = await sql<{ id: string }[]>`
    SELECT id FROM topics WHERE workspace_id = ${wid} AND lower(name) = lower(${name}) LIMIT 1
  `;
  if (dup) return null;
  const [row] = await sql<{ id: string; name: string }[]>`
    INSERT INTO topics (workspace_id, name) VALUES (${wid}, ${name}) RETURNING id, name
  `;
  return { id: row.id, name: row.name };
}

export async function removeTopic(wid: string, id: string): Promise<void> {
  await sql`DELETE FROM topics WHERE id = ${id} AND workspace_id = ${wid}`;
}

// ---------- scan ----------

export async function saveScan(wid: string, topics: string[], result: ScanResult): Promise<void> {
  await sql.begin(async (tx) => {
    const [scan] = await tx<{ id: string }[]>`
      INSERT INTO scans (workspace_id, topics_snapshot)
      VALUES (${wid}, ${sql.json(topics)}) RETURNING id
    `;
    const scanId = scan.id;

    if (result.items.length > 0) {
      const rows = result.items.map((it) => ({
        scan_id: scanId,
        ref: it.id,
        topic: it.topic,
        title: it.title,
        summary: it.summary,
        source: it.source,
        url: it.url,
        entities: it.entities,
        published_at: it.publishedAt || null,
      }));
      await tx`INSERT INTO news_items ${tx(
        rows,
        "scan_id",
        "ref",
        "topic",
        "title",
        "summary",
        "source",
        "url",
        "entities",
        "published_at",
      )}`;
    }

    if (result.insights.length > 0) {
      const rows = result.insights.map((ins) => ({
        scan_id: scanId,
        ref: ins.id,
        type: ins.type,
        title: ins.title,
        description: ins.description,
        rationale: ins.rationale,
        why_now: ins.whyNow,
        so_what: ins.soWhat,
        related_refs: ins.related_items,
      }));
      await tx`INSERT INTO insights ${tx(
        rows,
        "scan_id",
        "ref",
        "type",
        "title",
        "description",
        "rationale",
        "why_now",
        "so_what",
        "related_refs",
      )}`;
    }
  });
}

// Reconstrói o ScanResult do último scan usando ref como id — o mesmo formato
// que o LLM/mock produz, para o buildGraph() do frontend consumir sem tradução.
export async function getLatestScan(wid: string): Promise<{
  result: ScanResult;
  createdAt: string;
} | null> {
  const [scan] = await sql<{ id: string; created_at: unknown }[]>`
    SELECT id, created_at FROM scans WHERE workspace_id = ${wid}
    ORDER BY created_at DESC LIMIT 1
  `;
  if (!scan) return null;

  const itemRows = await sql<
    {
      ref: string;
      topic: string;
      title: string;
      summary: string | null;
      source: string | null;
      url: string | null;
      entities: string[] | null;
      published_at: unknown;
    }[]
  >`
    SELECT ref, topic, title, summary, source, url, entities, published_at
    FROM news_items WHERE scan_id = ${scan.id} ORDER BY created_at ASC
  `;
  const insightRows = await sql<
    {
      ref: string;
      type: Insight["type"];
      title: string;
      description: string | null;
      rationale: string | null;
      why_now: string | null;
      so_what: string | null;
      related_refs: string[] | null;
    }[]
  >`
    SELECT ref, type, title, description, rationale, why_now, so_what, related_refs
    FROM insights WHERE scan_id = ${scan.id} ORDER BY created_at ASC
  `;

  const items: NewsItem[] = itemRows.map((r) => ({
    id: r.ref,
    topic: r.topic,
    title: r.title,
    summary: r.summary ?? "",
    source: r.source ?? "",
    url: r.url ?? "",
    entities: r.entities ?? [],
    publishedAt: toDateStr(r.published_at),
  }));
  const insights: Insight[] = insightRows.map((r) => ({
    id: r.ref,
    type: r.type,
    title: r.title,
    description: r.description ?? "",
    rationale: r.rationale ?? "",
    whyNow: r.why_now ?? "",
    soWhat: r.so_what ?? "",
    related_items: r.related_refs ?? [],
  }));

  return { result: { items, insights }, createdAt: toIso(scan.created_at) };
}

// ---------- saved ideas ----------

interface NewIdea {
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

function mapIdeaRow(r: {
  id: string;
  insight_ref: string | null;
  type: SavedIdea["type"];
  title: string;
  description: string | null;
  rationale: string | null;
  why_now: string | null;
  so_what: string | null;
  notes: string | null;
  related_items: NewsItem[] | null;
  deep_dive: DeepDive | null;
  financials: Financials | null;
  saved_at: unknown;
}): SavedIdea {
  return {
    id: r.id,
    insightRef: r.insight_ref ?? "",
    type: r.type,
    title: r.title,
    description: r.description ?? "",
    rationale: r.rationale ?? "",
    whyNow: r.why_now ?? "",
    soWhat: r.so_what ?? "",
    notes: r.notes ?? "",
    savedAt: toIso(r.saved_at),
    relatedItems: r.related_items ?? [],
    deepDive: r.deep_dive ?? null,
    financials: r.financials ?? null,
  };
}

export async function listIdeas(wid: string): Promise<SavedIdea[]> {
  const rows = await sql<Parameters<typeof mapIdeaRow>[0][]>`
    SELECT id, insight_ref, type, title, description, rationale, why_now, so_what, notes, related_items, deep_dive, financials, saved_at
    FROM saved_ideas WHERE workspace_id = ${wid} ORDER BY saved_at DESC
  `;
  return rows.map(mapIdeaRow);
}

// busca uma ideia salva pelo id (para o mergulho ler a semente)
export async function getIdea(wid: string, id: string): Promise<SavedIdea | null> {
  const rows = await sql<Parameters<typeof mapIdeaRow>[0][]>`
    SELECT id, insight_ref, type, title, description, rationale, why_now, so_what, notes, related_items, deep_dive, financials, saved_at
    FROM saved_ideas WHERE id = ${id} AND workspace_id = ${wid} LIMIT 1
  `;
  return rows[0] ? mapIdeaRow(rows[0]) : null;
}

// grava o relatório do mergulho na ideia e devolve a ideia atualizada
export async function saveDeepDive(wid: string, id: string, dive: DeepDive): Promise<SavedIdea | null> {
  const rows = await sql<Parameters<typeof mapIdeaRow>[0][]>`
    UPDATE saved_ideas
    SET deep_dive = ${sql.json(dive as unknown as Parameters<typeof sql.json>[0])}, dived_at = now()
    WHERE id = ${id} AND workspace_id = ${wid}
    RETURNING id, insight_ref, type, title, description, rationale, why_now, so_what, notes, related_items, deep_dive, financials, saved_at
  `;
  return rows[0] ? mapIdeaRow(rows[0]) : null;
}

// grava a análise financeira (2º nível) e devolve a ideia atualizada
export async function saveFinancials(wid: string, id: string, fin: Financials): Promise<SavedIdea | null> {
  const rows = await sql<Parameters<typeof mapIdeaRow>[0][]>`
    UPDATE saved_ideas
    SET financials = ${sql.json(fin as unknown as Parameters<typeof sql.json>[0])}
    WHERE id = ${id} AND workspace_id = ${wid}
    RETURNING id, insight_ref, type, title, description, rationale, why_now, so_what, notes, related_items, deep_dive, financials, saved_at
  `;
  return rows[0] ? mapIdeaRow(rows[0]) : null;
}

export async function saveIdea(wid: string, idea: NewIdea): Promise<SavedIdea> {
  const [row] = await sql<Parameters<typeof mapIdeaRow>[0][]>`
    INSERT INTO saved_ideas (workspace_id, insight_ref, type, title, description, rationale, why_now, so_what, notes, related_items)
    VALUES (
      ${wid},
      ${idea.insightRef},
      ${idea.type},
      ${idea.title},
      ${idea.description},
      ${idea.rationale},
      ${idea.whyNow},
      ${idea.soWhat},
      ${idea.notes},
      ${sql.json(idea.relatedItems as unknown as Parameters<typeof sql.json>[0])}
    )
    RETURNING id, insight_ref, type, title, description, rationale, why_now, so_what, notes, related_items, deep_dive, financials, saved_at
  `;
  return mapIdeaRow(row);
}

export async function removeIdea(wid: string, id: string): Promise<void> {
  await sql`DELETE FROM saved_ideas WHERE id = ${id} AND workspace_id = ${wid}`;
}

// ---------- settings (lente do workspace) ----------

const LENSES: readonly Lens[] = ["founder", "investor", "explorer"];
function toLens(value: unknown): Lens | null {
  return typeof value === "string" && (LENSES as readonly string[]).includes(value)
    ? (value as Lens)
    : null;
}

export async function getLens(wid: string): Promise<Lens | null> {
  const [row] = await sql<{ lens: string | null }[]>`
    SELECT lens FROM workspace_settings WHERE workspace_id = ${wid} LIMIT 1
  `;
  return toLens(row?.lens);
}

// upsert: uma linha por workspace, atualizada no lugar
export async function setLens(wid: string, lens: Lens): Promise<void> {
  await sql`
    INSERT INTO workspace_settings (workspace_id, lens, updated_at)
    VALUES (${wid}, ${lens}, now())
    ON CONFLICT (workspace_id) DO UPDATE SET lens = ${lens}, updated_at = now()
  `;
}

// ---------- newsletter (mailing list global) ----------

// Captura um assinante da newsletter. NÃO é workspace-scoped (ver arquiteturad
// §4): o email é a identidade. Re-assinar faz upsert por email — atualiza os
// setores, reativa o status e toca updated_at, sem duplicar linha.
export async function saveSubscriber(email: string, sectors: string[]): Promise<void> {
  await sql`
    INSERT INTO subscribers (email, sectors)
    VALUES (${email}, ${sectors})
    ON CONFLICT (email) DO UPDATE
      SET sectors = EXCLUDED.sectors, status = 'active', updated_at = now()
  `;
}

// ---------- newsletter editions (edição semanal global) ----------

// A edição da semana NÃO é workspace-scoped: uma linha por semana (week_start),
// com os combos calculados sob demanda em `combos` JSONB. Sem workspace_id.
export async function getEdition(weekStart: string): Promise<NewsletterEdition | null> {
  const [row] = await sql<{ combos: Record<string, NewsletterCombo> | null }[]>`
    SELECT combos FROM newsletter_editions WHERE week_start = ${weekStart} LIMIT 1
  `;
  if (!row) return null;
  return { weekStart, combos: row.combos ?? {} };
}

// garante que a linha da semana exista antes de fazer merge de combos; idempotente.
export async function ensureEdition(weekStart: string): Promise<void> {
  await sql`
    INSERT INTO newsletter_editions (week_start) VALUES (${weekStart})
    ON CONFLICT (week_start) DO NOTHING
  `;
}

// faz merge de UM combo na edição da semana. O `||` do jsonb mescla a chave sem
// tocar nos outros combos já calculados.
export async function saveCombo(
  weekStart: string,
  key: string,
  combo: NewsletterCombo,
): Promise<void> {
  await sql`
    UPDATE newsletter_editions
    SET combos = combos || ${sql.json({ [key]: combo } as unknown as Parameters<typeof sql.json>[0])},
        updated_at = now()
    WHERE week_start = ${weekStart}
  `;
}
