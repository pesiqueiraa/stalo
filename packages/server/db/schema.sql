-- Stalo — schema inicial do Postgres (Supabase).
--
-- Fonte da verdade do schema é artefatos/arquiteturad.md §4; este arquivo é a
-- cópia executável dele. Ao mudar um, mude o outro (CLAUDE.md, regra 3).
--
-- Como aplicar: cole no SQL Editor do Supabase e rode, OU
--   psql "$DATABASE_URL" -f db/schema.sql
--
-- Isolamento por WORKSPACE ANÔNIMO (produto.md §2): sem login, mas cada visitante
-- tem um workspace_id (vindo de um cookie) para seus dados não vazarem para os
-- outros. topics/scans/saved_ideas têm workspace_id; news_items/insights herdam o
-- escopo via scan_id. Não é autenticação — quando contas reais (magic link)
-- entrarem, workspace_id vira o user_id.

-- temas monitorados
CREATE TABLE IF NOT EXISTS topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID,        -- dono do dado (workspace anônimo do visitante)
  name TEXT NOT NULL,
  color TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- cada execução de scan (um clique em "atualizar")
CREATE TABLE IF NOT EXISTS scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID,        -- dono do dado (workspace anônimo do visitante)
  topics_snapshot JSONB NOT NULL,  -- lista de temas usados nesse scan (ordem = cor no grafo)
  created_at TIMESTAMPTZ DEFAULT now()
);

-- notícias extraídas em um scan
CREATE TABLE IF NOT EXISTS news_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID REFERENCES scans(id) ON DELETE CASCADE,
  ref TEXT NOT NULL,        -- id local do item dentro do scan ("n1"), como veio do LLM;
                            -- usado para remontar as ligações do ScanResult na leitura
  topic TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  source TEXT,
  url TEXT,
  entities TEXT[],
  published_at DATE,        -- data original da notícia (não confundir com created_at)
  created_at TIMESTAMPTZ DEFAULT now()
);

-- insights extraídos em um scan
CREATE TABLE IF NOT EXISTS insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID REFERENCES scans(id) ON DELETE CASCADE,
  ref TEXT NOT NULL,             -- id local do insight dentro do scan ("i1"), como veio do LLM
  type TEXT CHECK (type IN ('tendencia','gap','oportunidade')),
  title TEXT NOT NULL,
  description TEXT,             -- a frase de efeito (até 25 palavras)
  rationale TEXT,              -- "por que conecta": a linha de raciocínio entre os setores
  why_now TEXT,               -- "por que agora": o sinal de timing que torna o cruzamento relevante neste momento
  so_what TEXT,               -- "e daí?": a ação/oportunidade concreta
  related_refs TEXT[],          -- refs das notícias relacionadas (as mesmas de news_items.ref)
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ideias salvas pelo usuário (o "produto" final do fluxo)
CREATE TABLE IF NOT EXISTS saved_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID,        -- dono do dado (workspace anônimo do visitante)
  insight_ref TEXT,         -- ref do insight de origem; permite detectar "já salva" no scan atual
  type TEXT,
  title TEXT NOT NULL,
  description TEXT,
  rationale TEXT,           -- "por que conecta" — snapshot do insight de origem
  why_now TEXT,             -- "por que agora" — snapshot do insight de origem
  so_what TEXT,             -- "e daí?" — snapshot do insight de origem
  related_items JSONB,      -- retrato das notícias relacionadas no momento do save
                            -- (título, resumo, fonte, url, published_at) — não é só uma
                            -- referência, que perderia sentido se o scan original for
                            -- substituído por um novo
  notes TEXT,               -- espaço para o usuário anotar aprendizados depois
  deep_dive JSONB,          -- relatório do "Mergulhar" gerado pela IA (panorama,
                            -- por que agora, próximos passos, sinais); null = não mergulhado
  dived_at TIMESTAMPTZ,     -- quando a ideia foi mergulhada
  financials JSONB,         -- análise financeira (2º nível: mercado, monetização,
                            -- premissas, custo de validar); null = não aprofundado
  saved_at TIMESTAMPTZ DEFAULT now()
);

-- preferências do workspace (uma linha por workspace). Hoje guarda só a lente
-- escolhida no onboarding (founder/investor/explorer). Quando contas reais
-- entrarem, workspace_id vira user_id, como no resto do schema.
CREATE TABLE IF NOT EXISTS workspace_settings (
  workspace_id UUID PRIMARY KEY,
  lens TEXT CHECK (lens IN ('founder','investor','explorer')),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- rate limiting (infra, não domínio): contador de janela fixa por chave
-- ("scan:<ip>", "dive:<ip>", ...), para proteger os endpoints de IA de abuso de
-- custo agora que o app é público. Uma linha por chave, atualizada no lugar.
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  count INT NOT NULL
);

-- migrações idempotentes: CREATE TABLE IF NOT EXISTS acima só vale para bancos
-- novos; para os que já existem, adiciona os campos ausentes. Rodar de novo não
-- quebra. Linhas antigas (pré-isolamento) ficam com workspace_id NULL — não
-- pertencem a nenhum visitante, então somem da visão de todos (sem vazamento).
ALTER TABLE insights    ADD COLUMN IF NOT EXISTS why_now TEXT;
ALTER TABLE saved_ideas ADD COLUMN IF NOT EXISTS why_now TEXT;
ALTER TABLE topics      ADD COLUMN IF NOT EXISTS workspace_id UUID;
ALTER TABLE scans       ADD COLUMN IF NOT EXISTS workspace_id UUID;
ALTER TABLE saved_ideas ADD COLUMN IF NOT EXISTS workspace_id UUID;

-- índices para as leituras mais comuns, todas escopadas por workspace_id.
CREATE INDEX IF NOT EXISTS topics_workspace_idx ON topics (workspace_id);
CREATE INDEX IF NOT EXISTS scans_workspace_created_idx ON scans (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS news_items_scan_id_idx ON news_items (scan_id);
CREATE INDEX IF NOT EXISTS insights_scan_id_idx ON insights (scan_id);
CREATE INDEX IF NOT EXISTS saved_ideas_workspace_saved_idx ON saved_ideas (workspace_id, saved_at DESC);

-- Sem seed de temas: com isolamento por workspace, cada visitante começa com o
-- radar vazio e adiciona os próprios temas (um seed global não faz mais sentido).
