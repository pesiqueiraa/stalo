-- Stalo — schema do Postgres (Supabase).
--
-- Fonte da verdade do schema é artefatos/arquiteturad.md §4; este arquivo é a
-- cópia executável dele. Ao mudar um, mude o outro (CLAUDE.md, regra 3).
--
-- Como aplicar: cole no SQL Editor do Supabase e rode, OU
--   psql "$DATABASE_URL" -f db/schema.sql
--
-- Os dados do visitante (temas, scans, ideias salvas, lente) saíram do banco
-- para o localStorage do navegador (2026-08, ver arquiteturad.md §7 e
-- artefatos/specs/2026-08-11-sem-banco-design.md). O que resta aqui é só a
-- newsletter (mailing list global, sem workspace), até o plano que a remove.

-- assinantes da newsletter (captura de email + setores no popup da landing).
-- NÃO é workspace-scoped: um assinante é um email numa mailing list, não um
-- visitante do app — o que identifica o registro é o email (UNIQUE), não um
-- workspace_id (ver arquiteturad.md §4). Re-assinar faz upsert por email.
CREATE TABLE IF NOT EXISTS subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  sectors TEXT[] NOT NULL DEFAULT '{}',  -- setores escolhidos no popup
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','unsubscribed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- edição semanal da newsletter: o conteúdo montado por semana. GLOBAL (não
-- workspace-scoped) — cada email só seleciona os setores do assinante desta
-- edição, sem re-rodar a IA por pessoa (ver arquiteturad.md §4). 1 linha/semana.
CREATE TABLE IF NOT EXISTS newsletter_editions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL UNIQUE,     -- segunda-feira da semana; identifica a edição
  combos JSONB NOT NULL DEFAULT '{}',  -- mapa "comboKey|origem" -> { items: NewsletterItem[], insights: Insight[] } (pronto pra renderizar; preenchido sob demanda)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- índice para a leitura mais comum (o cron do boletim busca só os ativos).
CREATE INDEX IF NOT EXISTS subscribers_status_idx ON subscribers (status);
