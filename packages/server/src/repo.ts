import "server-only";
import { sql } from "./db";
import type { NewsletterCombo, NewsletterEdition } from "@stalo/shared";

// Camada de acesso a dados: TODO o SQL do app vive aqui, mapeando as linhas
// do Postgres (snake_case) para os tipos do frontend (camelCase). O schema é
// artefatos/arquiteturad.md §4 / packages/server/db/schema.sql (CLAUDE.md regra 3).
//
// Os dados do visitante (temas, scans, ideias salvas, lente) saíram do banco
// para o localStorage do navegador (ver artefatos/specs/2026-08-11-sem-banco-design.md
// e o log de decisões em arquiteturad.md §7). O que sobra aqui é só a
// newsletter — mailing list global, sem workspace — até o plano que a remove.

// ---------- newsletter (mailing list global) ----------

// Captura um assinante da newsletter. NÃO é workspace-scoped (ver arquiteturad
// §4): o email é a identidade. Re-assinar faz upsert por email — atualiza os
// setores, reativa o status e toca updated_at, sem duplicar linha.
// Resultado do upsert, pra rota decidir se manda o e-mail de boas-vindas:
//   • "new"         → e-mail nunca visto (INSERT de fato aconteceu);
//   • "reactivated" → já existia mas estava 'unsubscribed' e voltou a 'active';
//   • "unchanged"   → já estava 'active' (re-submit do popup) → NÃO reenviar.
export type SubscribeOutcome = "new" | "reactivated" | "unchanged";

// Upsert por email + detecção do estado ANTERIOR, numa query só. O truque:
//   • `(xmax = 0)` distingue INSERT (xmax=0) de UPDATE — vira `inserted`;
//   • a CTE `prev` lê o status ANTES do upsert (todas as CTEs enxergam o mesmo
//     snapshot do início do statement), então dá pra saber se a linha existente
//     estava 'unsubscribed' (reativação) ou 'active' (nada muda).
export async function saveSubscriber(
  email: string,
  sectors: string[],
): Promise<{ id: string; outcome: SubscribeOutcome }> {
  const [row] = await sql<{ id: string; inserted: boolean; prev_status: string | null }[]>`
    WITH prev AS (
      SELECT status FROM subscribers WHERE email = ${email}
    ),
    up AS (
      INSERT INTO subscribers (email, sectors)
      VALUES (${email}, ${sectors})
      ON CONFLICT (email) DO UPDATE
        SET sectors = EXCLUDED.sectors, status = 'active', updated_at = now()
      RETURNING id, (xmax = 0) AS inserted
    )
    SELECT up.id, up.inserted, prev.status AS prev_status
    FROM up LEFT JOIN prev ON true
  `;
  const outcome: SubscribeOutcome = row.inserted
    ? "new"
    : row.prev_status === "unsubscribed"
      ? "reactivated"
      : "unchanged";
  return { id: row.id, outcome };
}

// Assinantes ATIVOS, para o envio semanal do boletim. Quem descadastrou
// (status='unsubscribed') some do lote.
export async function getActiveSubscribers(): Promise<
  { id: string; email: string; sectors: string[] }[]
> {
  const rows = await sql<{ id: string; email: string; sectors: string[] | null }[]>`
    SELECT id, email, sectors FROM subscribers WHERE status = 'active'
  `;
  return rows.map((r) => ({ id: r.id, email: r.email, sectors: r.sectors ?? [] }));
}

// Descadastra por id (o UUID do assinante é o token do link no boletim).
// Idempotente: reaplicar não quebra se já estava descadastrado.
export async function unsubscribe(id: string): Promise<void> {
  await sql`
    UPDATE subscribers SET status = 'unsubscribed', updated_at = now() WHERE id = ${id}
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
