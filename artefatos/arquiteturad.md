# Arquitetura — Stalo (o radar de tendências)

## 1. O que já existe

O protótipo funcional está em [`artefatos/prototype.html`](./prototype.html) — um artifact (HTML + JS puro + D3, sem build step) que valida a interação completa:

- Gestão de temas monitorados (add/remove, limite de 5).
- Botão de scan que chama a Claude API diretamente do client, com a ferramenta `web_search` habilitada, pedindo uma resposta em JSON estrito (notícias + insights).
- Construção de um grafo (nós = notícias e insights; arestas = palavras-chave compartilhadas ou insight → notícia relacionada) renderizado com `d3-force`.
- Painel de detalhe por nó, com botão "Salvar ideia" nos nós de insight.
- Persistência via uma API de key-value simples (`window.storage`), disponível apenas dentro do ambiente de artifacts.

**Este protótipo é a especificação de comportamento** para a versão real — a lógica de prompt, o formato de JSON esperado, e a lógica de construção do grafo podem ser portados quase diretamente. O que muda é a infraestrutura por trás.

## 2. Por que o protótipo não pode virar produto direto

Duas limitações do ambiente de artifact não existem mais fora dele, e precisam ser resolvidas conscientemente:

1. **A chamada à API roda no client, sem expor uma API key.** Isso só é seguro porque o ambiente de artifacts intermedia a chamada. Num app real, chamar a Claude API direto do navegador exigiria expor a API key no bundle JS — **isso nunca deve acontecer**. A chamada precisa migrar para um backend.
2. **`window.storage` não existe fora do ambiente de artifacts.** Precisa de um banco de dados real.

## 3. Arquitetura proposta

```
┌─────────────┐        ┌──────────────────┐        ┌─────────────────┐
│   Frontend   │  HTTP  │  Backend (API)    │  HTTP  │   API de IA      │
│ React + D3   │───────▶│  Node.js          │───────▶│  (server-side,   │
│ (Next.js)    │◀───────│  (rotas /api/*)   │◀───────│   key protegida) │
└─────────────┘        └────────┬─────────┘        └─────────────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │   Postgres        │
                         │ (Supabase/Neon)   │
                         └─────────────────┘
```

- **Frontend:** consome apenas endpoints do próprio backend. Nunca fala diretamente com a API de IA.
- **Backend:** único lugar com a chave da IA (`OPENAI_API_KEY` no MVP, variável de ambiente, nunca commitada). Também expõe endpoints de CRUD para temas e ideias salvas.
- **Banco:** substitui o `window.storage` do protótipo. Guarda temas, histórico de scans, notícias, insights e ideias salvas.

## 4. Modelo de dados (proposta inicial)

```sql
-- temas monitorados
CREATE TABLE topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID,        -- dono do dado (workspace anônimo do visitante)
  name TEXT NOT NULL,
  color TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- cada execução de scan (um clique em "atualizar")
CREATE TABLE scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID,        -- dono do dado (workspace anônimo do visitante)
  topics_snapshot JSONB NOT NULL,  -- lista de temas usados nesse scan
  created_at TIMESTAMPTZ DEFAULT now()
);

-- notícias extraídas em um scan
CREATE TABLE news_items (
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
CREATE TABLE insights (
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
CREATE TABLE saved_ideas (
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
                             -- (título, resumo, fonte, url, published_at) — não é só
                             -- uma referência, que pode ficar sem sentido se o scan
                             -- original for substituído por um novo
  notes TEXT,               -- espaço para o usuário anotar aprendizados depois
  deep_dive JSONB,          -- relatório do "Mergulhar" gerado pela IA (panorama,
                            -- por que agora, próximos passos, sinais); null = não mergulhado
  dived_at TIMESTAMPTZ,     -- quando a ideia foi mergulhada
  financials JSONB,         -- análise financeira (2º nível: mercado, monetização,
                            -- premissas, custo de validar); null = não aprofundado
  saved_at TIMESTAMPTZ DEFAULT now()
);

-- preferências do workspace (uma linha por workspace). Hoje só a lente escolhida
-- no onboarding (founder/investor/explorer). Quando contas reais entrarem,
-- workspace_id vira user_id, como no resto do schema.
CREATE TABLE workspace_settings (
  workspace_id UUID PRIMARY KEY,
  lens TEXT CHECK (lens IN ('founder','investor','explorer')),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- rate limiting (infra, não domínio): contador de janela fixa por chave
-- ("scan:<ip>", "dive:<ip>", ...) para proteger os endpoints de IA de abuso de
-- custo, agora que o app é público. Uma linha por chave, atualizada no lugar.
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  count INT NOT NULL
);
```

> **Lente do workspace (`workspace_settings`):** a lente escolhida no onboarding é preferência de workspace (uma linha por `workspace_id`), não atributo de insight — a taxonomia de insights continua universal. Ela afina a *linguagem de direcionamento* do mergulho e o ranqueamento do brief (§7), não o scan nem o grafo.

> **`ref` (id local do scan):** o `ScanResult` que sai do LLM usa ids locais como
> `"n1"`/`"i1"` para ligar insights às notícias. Guardamos esses ids na coluna `ref`
> (em vez de referenciar os UUIDs entre tabelas) para que `GET /api/scan/latest` remonte
> o `ScanResult` no formato exato que o `buildGraph()` do frontend espera, sem tradução de
> ids. O SQL executável fica em [`packages/server/db/schema.sql`](../packages/server/db/schema.sql).

> **Isolamento por workspace anônimo:** `topics`, `scans` e `saved_ideas` têm `workspace_id` — o id de um workspace anônimo por visitante (cookie `stalo_wid`, criado no `apps/web/src/proxy.ts` (convenção "proxy" do Next 16, ex-middleware), lido no servidor por `getWorkspaceId()` em `apps/web/src/lib/workspace.ts`). Toda função do `repo.ts` recebe esse id e escopa o SQL por ele; `news_items`/`insights` herdam o escopo via `scan_id`. Isso isola os dados sem login (ver `produto.md` §2). Não é autenticação: quando contas reais (magic link) entrarem, `workspace_id` vira `user_id` com FK para uma tabela `users`, sem reescrever as queries.

## 5. Endpoints propostos

| Método | Rota | Faz o quê |
|---|---|---|
| `GET` | `/api/topics` | Lista temas monitorados |
| `POST` | `/api/topics` | Adiciona um tema (valida limite de 5) |
| `DELETE` | `/api/topics/:id` | Remove um tema |
| `POST` | `/api/scan` | Roda o scan em duas etapas (Coletor com busca web + Analista), valida/limpa, persiste `scans` + `news_items` + `insights`, e devolve o `ScanResult` |
| `GET` | `/api/scan/latest` | Retorna o último scan (para o frontend recarregar estado ao abrir a página) |
| `POST` | `/api/ideas` | Salva uma ideia a partir de um insight |
| `GET` | `/api/ideas` | Lista ideias salvas |
| `DELETE` | `/api/ideas/:id` | Remove uma ideia salva |

## 6. Fluxo de um scan (ponta a ponta)

1. Frontend chama `POST /api/scan` (via `requestScan` em `apps/web/src/lib/api.ts`) com a lista de temas ativos.
2. A rota (`apps/web/src/app/api/scan/route.ts`) valida o corpo e delega para `runScan(topics, days)` de `@stalo/server` (`packages/server/src/scan.ts`) — o **ponto único onde a API de IA está plugada** (hoje OpenAI; trocar por Claude no fim do MVP mexe só neste arquivo).
3. `runScan` roda **duas etapas** (ver `packages/server/src/scanPrompt.ts`, o módulo compartilhado da regra 4):
   - **① Coletor** — chama o provider **com busca web** e structured outputs (schema Zod), devolvendo só as notícias (`items`, com ids `n1…n8`).
   - **② Analista** — chama o provider **sem busca**, recebe os `items` e cruza os temas, devolvendo `insights` (`i1…i3`) que referenciam os ids das notícias.
   - Depois, uma **camada de validação em código** (não é IA) deduplica notícias, descarta insights com `related_items` órfãos ou com menos de 2 notícias, e aplica os limites (8/3).
4. Backend persiste `scans`, `news_items`, `insights` no Postgres (`saveScan`).
5. A rota devolve o `ScanResult` cru (items + insights) — o mesmo contrato de JSON do prompt.
6. Frontend chama `buildGraph(result, topics)` (`apps/web/src/lib/graph.ts`) para montar nós/arestas e renderiza com D3. A construção do grafo fica no client porque depende de estado de apresentação do client (cor por ordem de tema).

> Decisão de arquitetura: a rota devolve `ScanResult` e o client constrói o grafo (em vez de o backend já devolver o grafo pronto). Assim o `ScanResult` — que é exatamente a saída do LLM — vira a fronteira limpa entre provider de IA e visualização.

## 7. Decisões técnicas e trade-offs

- **Postgres via Supabase/Neon** em vez de banco próprio auto-hospedado: reduz tempo de setup e custo operacional para um projeto solo em estágio inicial. Trocar depois é possível sem reescrever a lógica de aplicação, só a camada de acesso a dados.
- **Scan sob demanda (MVP) em vez de agendado**: evita custo de API rodando sem controle antes de validar se o produto é usado de verdade. Agendamento entra no roadmap pós-MVP.
- **JSON estruturado direto do LLM em vez de pipeline de NLP próprio** (NER, classificação separada): mais rápido de construir, custo de precisão aceitável para v1. Se a qualidade da extração de entidades for um problema recorrente, vale revisitar com um passo de pós-processamento dedicado.
- **Scan em duas etapas (Coletor + Analista) em vez de uma chamada só**: separa "buscar/estruturar" de "cruzar setores". O Analista roda **sem busca web**, então só cruza notícias que o Coletor de fato encontrou — anti-alucinação de graça. Custo é ~2 chamadas, mas a 2ª é pequena (só os `items`, sem re-busca). Ver análise de custo do projeto.
- **OpenAI no MVP, Claude no fim**: decisão de custo para a fase inicial. O provider é isolado em `scan.ts`; os prompts (`scanPrompt.ts`) são provider-neutros, então a troca não mexe na lógica do produto.
- **Brief priorizado como superfície principal, grafo como camada secundária**: para o público-alvo (scout/estrategista, ver `produto.md` §2-3), a saída de valor é um memo rankeado — as oportunidades da semana com tese, *por que agora* e fontes rastreáveis — não uma rede para explorar às cegas. O ranqueamento hoje é por evidência (nº de notícias que sustentam a tese). O grafo (`buildGraph()` + D3) continua como visão de "explorar o mapa" / evidência de como as conexões se ligam, mas deixa de ser o headline. O `ScanResult` continua sendo a fronteira única: alimenta tanto o brief quanto o grafo, então essa mudança é de apresentação, não de contrato de dados.
- **`Insight` enriquecido com `why_now`**: o cruzamento vira tese quando tem timing (*por que agora*), além do *por que conecta* e do *e daí?*. Campo adicionado ao schema (§4); o Analista (`scanPrompt.ts`) o emite e os tipos de `@stalo/shared` (`Insight`), o `repo.ts` e `packages/server/db/schema.sql` acompanham (regras 3 e 4 do `CLAUDE.md`). Um score de confiança do cruzamento foi considerado e adiado para backlog (ver `notas.md`): a versão útil é objetiva (recorrência entre scans), que depende de histórico ainda não acumulado — a autoavaliação do LLM sozinha era subjetiva demais para exibir.
- **Coleta sob demanda com LLM+busca em vez de pipeline volumoso (RSS/API de notícias)**: o valor do produto é curadoria + cruzamento, não volume (ver `produto.md`). Pipeline volumoso fica no backlog, só se cobertura/histórico/digest agendado virarem prioridade.
- **`max_tokens` fixo e prompt com limites explícitos** (máx. 8 notícias, máx. 3 insights por scan): decisão deliberada para manter respostas previsíveis e baratas; ajustar para cima só se o volume de temas monitorados crescer no roadmap.
- **Personalização por lente (perfil) mora no prompt do mergulho (`dive`), não no scan nem no brief**: o onboarding captura a lente do usuário (**founder / investidor / explorador** — a ideia de "público" de `produto.md` §2-3). As **categorias de insight continuam universais** (`tendência / gap / oportunidade` — mesmos glifos, cores e taxonomia em grafo, brief e mergulho); por isso **não é mudança no `type` do `Insight`** nem no schema de `insights`. O que muda por lente é a **linguagem de direcionamento** — o *"e daí?"/payoff*, os *passos* e o *2º nível financeiro* do mergulho — e a **ordem do brief** (qual categoria lidera é ranqueamento, não regeneração de texto). O **grafo permanece neutro** (é a superfície de triagem/mapa; a divergência por perfil precisa de densidade, e o mergulho é onde ela cabe). Consequência técnica: a lente vira **parâmetro do prompt do `dive`** (e do `financials`), threaded pelo módulo compartilhado de prompts (regra 4). Isso isola a personalização à geração sob demanda (barata, por insight) e preserva o "mesmo radar pra todo mundo" (comparabilidade). A lente é preferência de **workspace/usuário** (não por insight), persistida em `workspace_settings` (§4). **Implementado:** capturada no onboarding, e o prompt do mergulho já se ajusta a ela (`buildDeepDiveSystemPrompt` em `scanPrompt.ts`; a rota `/api/ideas/:id/dive` lê `getLens(wid)` e passa pra `runDeepDive`) — founder puxa validação com cliente, investidor puxa diligência/deal, explorador puxa sinais a acompanhar. O 2º nível financeiro também se ajusta à lente (`buildFinancialsSystemPrompt`; a rota `/api/ideas/:id/financials` lê `getLens(wid)`): founder foca em bootstrap/receita, investidor em venture-scale/defensibilidade, explorador em por onde o dinheiro flui. Os esquemas de saída (mergulho e financeiro), o scan e o grafo seguem neutros; o **brief é reordenado por lente na apresentação** — o componente `Brief` põe a categoria que a lente lidera no topo (evidência como desempate), via `LENS_LEAD_CATEGORY` em `apps/web/src/lib/ui.ts`, com a lente lida por `GET /api/settings`. É reordenação de apresentação: não regenera texto nem altera o contrato do `ScanResult`.

## 8. Como começar a implementar

Ordem escolhida (frontend primeiro com dados mockados, para validar a UI antes de investir em infraestrutura de dados/LLM):

1. Setup do projeto: Next.js (App Router) com TypeScript e Tailwind, resolvendo frontend + backend no mesmo projeto (rotas `/api/*` viram os endpoints do backend mais adiante).
2. Frontend com dados mockados: portar a UI do protótipo (topics sidebar, grafo D3, painel de detalhe, ideias salvas) trocando `window.storage` por estado local/`localStorage` e o `scanNews()` real por uma função que retorna um `ScanResult` mockado (mesmo formato de JSON da seção 6), para validar a experiência completa sem depender de banco nem da Claude API.
3. **[feito]** Endpoint `POST /api/scan` no servidor com o "encaixe" do provider (`runScan`) e o prompt no módulo compartilhado — porém ainda servido por mock, porque a API de IA não foi escolhida. O frontend já consome o endpoint via `fetch` (não gera mais os dados no client).
4. **[em andamento]** Plugar a API de IA em `runScan`: **OpenAI** (Responses API) em duas etapas (Coletor com `web_search` + Analista), structured outputs por schema Zod, e validação em código. `OPENAI_API_KEY` em variável de ambiente no servidor. Falta configurar a key e testar ponta a ponta; troca para Claude planejada para o fim do MVP.
5. **[feito]** Banco de dados: projeto no Supabase, schema da seção 4 em `packages/server/db/schema.sql`, acesso via `packages/server/src/db.ts` (postgres.js) + `packages/server/src/repo.ts`. O `localStorage` (temas, ideias, último scan) foi trocado pelos endpoints `/api/topics`, `/api/ideas`, `/api/scan` e `/api/scan/latest`.
6. Deploy: Vercel + a variável de ambiente da chave de IA configurada no painel do Vercel, nunca no código.