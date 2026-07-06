import "server-only";
import { sql } from "./db";
import type {
  DeepDive,
  Financials,
  Insight,
  NewsItem,
  SavedIdea,
  ScanResult,
  Topic,
} from "@stalo/shared";

// Camada de acesso a dados: TODO o SQL do app vive aqui, mapeando as linhas
// do Postgres (snake_case) para os tipos do frontend (camelCase). O schema é
// artefatos/arquiteturad.md §4 / frontend/db/schema.sql (CLAUDE.md regra 3).

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

export async function listTopics(): Promise<Topic[]> {
  const rows = await sql<{ id: string; name: string }[]>`
    SELECT id, name FROM topics ORDER BY created_at ASC
  `;
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

export async function countTopics(): Promise<number> {
  const [row] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM topics`;
  return row.count;
}

// Retorna o tema criado, ou null se o nome já existe (case-insensitive).
export async function addTopic(name: string): Promise<Topic | null> {
  const [dup] = await sql<{ id: string }[]>`
    SELECT id FROM topics WHERE lower(name) = lower(${name}) LIMIT 1
  `;
  if (dup) return null;
  const [row] = await sql<{ id: string; name: string }[]>`
    INSERT INTO topics (name) VALUES (${name}) RETURNING id, name
  `;
  return { id: row.id, name: row.name };
}

export async function removeTopic(id: string): Promise<void> {
  await sql`DELETE FROM topics WHERE id = ${id}`;
}

// ---------- scan ----------

export async function saveScan(topics: string[], result: ScanResult): Promise<void> {
  await sql.begin(async (tx) => {
    const [scan] = await tx<{ id: string }[]>`
      INSERT INTO scans (topics_snapshot) VALUES (${sql.json(topics)}) RETURNING id
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
        "so_what",
        "related_refs",
      )}`;
    }
  });
}

// Reconstrói o ScanResult do último scan usando ref como id — o mesmo formato
// que o LLM/mock produz, para o buildGraph() do frontend consumir sem tradução.
export async function getLatestScan(): Promise<{
  result: ScanResult;
  createdAt: string;
} | null> {
  const [scan] = await sql<{ id: string; created_at: unknown }[]>`
    SELECT id, created_at FROM scans ORDER BY created_at DESC LIMIT 1
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
      so_what: string | null;
      related_refs: string[] | null;
    }[]
  >`
    SELECT ref, type, title, description, rationale, so_what, related_refs
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
    soWhat: r.so_what ?? "",
    notes: r.notes ?? "",
    savedAt: toIso(r.saved_at),
    relatedItems: r.related_items ?? [],
    deepDive: r.deep_dive ?? null,
    financials: r.financials ?? null,
  };
}

export async function listIdeas(): Promise<SavedIdea[]> {
  const rows = await sql<Parameters<typeof mapIdeaRow>[0][]>`
    SELECT id, insight_ref, type, title, description, rationale, so_what, notes, related_items, deep_dive, financials, saved_at
    FROM saved_ideas ORDER BY saved_at DESC
  `;
  return rows.map(mapIdeaRow);
}

// busca uma ideia salva pelo id (para o mergulho ler a semente)
export async function getIdea(id: string): Promise<SavedIdea | null> {
  const rows = await sql<Parameters<typeof mapIdeaRow>[0][]>`
    SELECT id, insight_ref, type, title, description, rationale, so_what, notes, related_items, deep_dive, financials, saved_at
    FROM saved_ideas WHERE id = ${id} LIMIT 1
  `;
  return rows[0] ? mapIdeaRow(rows[0]) : null;
}

// grava o relatório do mergulho na ideia e devolve a ideia atualizada
export async function saveDeepDive(id: string, dive: DeepDive): Promise<SavedIdea | null> {
  const rows = await sql<Parameters<typeof mapIdeaRow>[0][]>`
    UPDATE saved_ideas
    SET deep_dive = ${sql.json(dive as unknown as Parameters<typeof sql.json>[0])}, dived_at = now()
    WHERE id = ${id}
    RETURNING id, insight_ref, type, title, description, rationale, so_what, notes, related_items, deep_dive, financials, saved_at
  `;
  return rows[0] ? mapIdeaRow(rows[0]) : null;
}

// grava a análise financeira (2º nível) e devolve a ideia atualizada
export async function saveFinancials(id: string, fin: Financials): Promise<SavedIdea | null> {
  const rows = await sql<Parameters<typeof mapIdeaRow>[0][]>`
    UPDATE saved_ideas
    SET financials = ${sql.json(fin as unknown as Parameters<typeof sql.json>[0])}
    WHERE id = ${id}
    RETURNING id, insight_ref, type, title, description, rationale, so_what, notes, related_items, deep_dive, financials, saved_at
  `;
  return rows[0] ? mapIdeaRow(rows[0]) : null;
}

export async function saveIdea(idea: NewIdea): Promise<SavedIdea> {
  const [row] = await sql<Parameters<typeof mapIdeaRow>[0][]>`
    INSERT INTO saved_ideas (insight_ref, type, title, description, rationale, so_what, notes, related_items)
    VALUES (
      ${idea.insightRef},
      ${idea.type},
      ${idea.title},
      ${idea.description},
      ${idea.rationale},
      ${idea.soWhat},
      ${idea.notes},
      ${sql.json(idea.relatedItems as unknown as Parameters<typeof sql.json>[0])}
    )
    RETURNING id, insight_ref, type, title, description, rationale, so_what, notes, related_items, deep_dive, financials, saved_at
  `;
  return mapIdeaRow(row);
}

export async function removeIdea(id: string): Promise<void> {
  await sql`DELETE FROM saved_ideas WHERE id = ${id}`;
}
