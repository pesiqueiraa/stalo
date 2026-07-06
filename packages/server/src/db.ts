import "server-only";
import postgres from "postgres";

// Client único do Postgres (Supabase). SERVER-ONLY: importado apenas por rotas
// /api/* e módulos de servidor — a DATABASE_URL nunca chega ao client.
//
// Use a connection string do POOLER do Supabase (porta 6543, "Transaction"),
// indicada para ambientes serverless (Vercel). Com o pooler em modo transaction
// o postgres.js precisa de `prepare: false` (o pgbouncer não persiste prepared
// statements).
//
// A conexão é criada de forma preguiçosa (na primeira query), não no import:
// assim `next build` / `next dev` não quebram se a DATABASE_URL ainda não estiver
// configurada — o erro só aparece quando uma rota de fato tenta usar o banco.

type Sql = ReturnType<typeof postgres>;

// Em dev o Next recarrega os módulos a cada mudança; reaproveitar a conexão
// pelo globalThis evita abrir um pool novo a cada hot-reload.
const globalForDb = globalThis as unknown as { sql?: Sql };

function getClient(): Sql {
  if (globalForDb.sql) return globalForDb.sql;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL não configurada. Defina no .env (dev) e no painel do Vercel (prod).",
    );
  }
  const client = postgres(connectionString, {
    prepare: false,
    ssl: "require", // Supabase (e Postgres hospedado em geral) exige TLS
    max: 5, // pool pequeno: MVP single-user, serverless não se beneficia de pool grande
  });
  globalForDb.sql = client;
  return client;
}

// Proxy que resolve o client na primeira utilização, mantendo a API do
// postgres.js intacta: `sql\`...\``, `sql.json(...)`, `sql.begin(...)`.
export const sql = new Proxy((() => undefined) as unknown as Sql, {
  apply(_target, _thisArg, args: unknown[]) {
    return (getClient() as unknown as (...a: unknown[]) => unknown)(...args);
  },
  get(_target, prop) {
    const client = getClient() as unknown as Record<string | symbol, unknown>;
    const value = client[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(client) : value;
  },
}) as Sql;
