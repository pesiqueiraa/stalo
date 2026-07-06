-- Stalo — schema inicial do Postgres (Supabase).
--
-- Fonte da verdade do schema é artefatos/arquiteturad.md §4; este arquivo é a
-- cópia executável dele. Ao mudar um, mude o outro (CLAUDE.md, regra 3).
--
-- Como aplicar: cole no SQL Editor do Supabase e rode, OU
--   psql "$DATABASE_URL" -f db/schema.sql
--
-- MVP é single-user por decisão de produto (produto.md §2): nenhuma tabela tem
-- user_id. Isso muda quando multi-usuário entrar no roadmap.

-- temas monitorados
CREATE TABLE IF NOT EXISTS topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- cada execução de scan (um clique em "atualizar")
CREATE TABLE IF NOT EXISTS scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  so_what TEXT,               -- "e daí?": a ação/oportunidade concreta
  related_refs TEXT[],          -- refs das notícias relacionadas (as mesmas de news_items.ref)
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ideias salvas pelo usuário (o "produto" final do fluxo)
CREATE TABLE IF NOT EXISTS saved_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_ref TEXT,         -- ref do insight de origem; permite detectar "já salva" no scan atual
  type TEXT,
  title TEXT NOT NULL,
  description TEXT,
  rationale TEXT,           -- "por que conecta" — snapshot do insight de origem
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

-- índices para as leituras mais comuns (último scan, itens/insights por scan)
CREATE INDEX IF NOT EXISTS scans_created_at_idx ON scans (created_at DESC);
CREATE INDEX IF NOT EXISTS news_items_scan_id_idx ON news_items (scan_id);
CREATE INDEX IF NOT EXISTS insights_scan_id_idx ON insights (scan_id);
CREATE INDEX IF NOT EXISTS saved_ideas_saved_at_idx ON saved_ideas (saved_at DESC);

-- seed dos temas iniciais (só quando a tabela está vazia) — os mesmos que o
-- mock de scan usa como demonstração enquanto a API de IA não é plugada.
-- Rodar o schema de novo não duplica: o WHERE NOT EXISTS impede.
INSERT INTO topics (name)
SELECT name FROM (
  VALUES ('Inteligência Artificial'), ('Energia'), ('Blockchain'), ('Computação Quântica')
) AS seed(name)
WHERE NOT EXISTS (SELECT 1 FROM topics);
