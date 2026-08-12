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

## 4. Modelo de dados

Os dados do visitante (temas, scans, ideias salvas, lente) não moram mais no banco — vivem no `localStorage` do navegador (ver decisão "Dados do visitante saem do Postgres, vão para o `localStorage`" em §7). O que resta no Postgres é só a newsletter, uma mailing list global sem relação com o workspace do visitante:

```sql
-- assinantes da newsletter (captura de email + setores no popup da landing).
-- NÃO é workspace-scoped: um assinante é um email numa mailing list, não um
-- visitante do app (ver blockquote abaixo). Re-assinar faz upsert por email.
CREATE TABLE subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  sectors TEXT[] NOT NULL DEFAULT '{}',  -- setores escolhidos no popup
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','unsubscribed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- edição semanal da newsletter: o conteúdo montado por semana. GLOBAL (não
-- workspace-scoped) — cada email só seleciona os setores do assinante desta
-- edição, sem re-rodar a IA por pessoa. Uma linha por semana (ver blockquote).
CREATE TABLE newsletter_editions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL UNIQUE,     -- segunda-feira da semana; identifica a edição
  combos JSONB NOT NULL DEFAULT '{}',  -- mapa "comboKey|origem" -> { items: NewsletterItem[], insights: Insight[] } (pronto pra renderizar; preenchido sob demanda)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

> **Assinantes (`subscribers`):** EXCEÇÃO deliberada ao padrão "tudo é workspace-scoped". Um assinante é um **email externo numa mailing list**, não um visitante/workspace do app: a mesma pessoa pode assinar de qualquer navegador, sem cookie de workspace, e o que identifica o registro é o `email` (UNIQUE), não um `workspace_id`. Por isso a tabela não tem `workspace_id` e a função de repo não recebe `wid`. Re-assinar é **upsert por email** (`ON CONFLICT (email) DO UPDATE`): atualiza `sectors`, reativa (`status = 'active'`) e toca `updated_at`, sem criar linha duplicada. Escopo atual é só CAPTURA/persistência — sem envio de email nem ESP; `status` já prevê o `unsubscribe` futuro. Não é autenticação (mailing list não é login, ver `produto.md` §2 / CLAUDE.md regra 2).

> **Edição da newsletter (`newsletter_editions`):** 2ª EXCEÇÃO deliberada ao workspace-scoping (como `subscribers`). O conteúdo semanal é igual pra todos os assinantes — o que muda por pessoa é só QUAIS setores aparecem —, então é global, **uma linha por semana** (`week_start` UNIQUE, a segunda-feira da edição). `combos` (JSONB) mapeia `comboKey|origem` → `{ items: NewsletterItem[], insights: Insight[] }` **pronto pra renderizar** (`comboKey` = os setores do assinante ordenados e concatenados), preenchido **sob demanda**: o 1º assinante de um combo dispara a ingestão RSS + o Analista (`analyze()`) sobre os itens combinados (ids reatribuídos), e os demais do mesmo combo reusam. Assim a IA roda **por combo único, não por assinante**. Reaproveita os contratos `NewsItem`/`Insight` de `@stalo/shared`: na newsletter a ingestão RSS substitui só a ETAPA DE COLETA do scan; o Analista e a validação (`validate.ts`) seguem iguais.

O SQL executável fica em [`packages/server/db/schema.sql`](../packages/server/db/schema.sql). Os dados do visitante (temas, último scan, ideias salvas, lente) e a forma como cada um é validado ao sair do `localStorage` estão em `apps/web/src/lib/storage.ts` — sem contrapartida em SQL, então não há uma seção equivalente aqui; ver a decisão em §7.

## 5. Endpoints

Nenhuma rota persiste dados do visitante — todas são funções finas que recebem entrada, chamam a IA quando precisam, e devolvem resultado. Quem guarda temas, scan e ideias é o navegador (`apps/web/src/lib/storage.ts`, ver §7).

| Método | Rota | Faz o quê |
|---|---|---|
| `POST` | `/api/scan` | Roda o scan em duas etapas (Coletor com busca web + Analista), valida/limpa, e devolve o `ScanResult` — sem persistir |
| `POST` | `/api/dive` | "Mergulhar": recebe a ideia salva no corpo (não busca mais no banco) e devolve o `DeepDive` gerado com busca web |
| `POST` | `/api/financials` | "Aprofundar": recebe a ideia (já mergulhada) no corpo e devolve a análise financeira (2º nível) |
| `POST` | `/api/newsletter` | Captura assinante da newsletter (email + setores) — valida e faz upsert em `subscribers`; dispara e-mail de boas-vindas em cadastro novo/reativação. Não é workspace-scoped |
| `GET` | `/api/newsletter/preview` | Renderiza o boletim na tela sob demanda (amostra ou edição real via `?sectors=`), para conferir o template |
| `GET` | `/api/newsletter/send` | Cron semanal (Vercel Cron, protegido por `CRON_SECRET`): monta e envia o boletim da semana a cada assinante ativo |
| `POST` | `/api/newsletter/test` | Envio de teste sob demanda, protegido por `NEWSLETTER_ADMIN_SECRET` |
| `GET` | `/api/newsletter/unsubscribe` | Descadastro por 1 clique no link do boletim (idempotente, sem segredo — o UUID do assinante é o token) |

## 6. Fluxo de um scan (ponta a ponta)

1. Frontend chama `POST /api/scan` (via `requestScan` em `apps/web/src/lib/api.ts`) com a lista de temas ativos.
2. A rota (`apps/web/src/app/api/scan/route.ts`) valida o corpo e delega para `runScan(topics, days)` de `@stalo/server` (`packages/server/src/scan.ts`) — o **ponto único onde a API de IA está plugada** (hoje OpenAI; trocar por Claude no fim do MVP mexe só neste arquivo).
3. `runScan` roda **duas etapas** (ver `packages/server/src/scanPrompt.ts`, o módulo compartilhado da regra 4):
   - **① Coletor** — chama o provider **com busca web** e structured outputs (schema Zod), devolvendo só as notícias (`items`, com ids `n1…n8`).
   - **② Analista** — chama o provider **sem busca**, recebe os `items` e cruza os temas, devolvendo `insights` (`i1…i3`) que referenciam os ids das notícias.
   - Depois, uma **camada de validação em código** (não é IA) deduplica notícias, descarta insights com `related_items` órfãos ou com menos de 2 notícias, e aplica os limites (8/3).
4. A rota devolve o `ScanResult` cru (items + insights) — o mesmo contrato de JSON do prompt. Ela não persiste nada; quem grava o resultado é o navegador, em `apps/web/src/lib/storage.ts` (ver §7).
5. Frontend chama `buildGraph(result, topics)` (`apps/web/src/lib/graph.ts`) para montar nós/arestas e renderiza com D3. A construção do grafo fica no client porque depende de estado de apresentação do client (cor por ordem de tema).

> Decisão de arquitetura: a rota devolve `ScanResult` e o client constrói o grafo (em vez de o backend já devolver o grafo pronto). Assim o `ScanResult` — que é exatamente a saída do LLM — vira a fronteira limpa entre provider de IA e visualização.

## 7. Decisões técnicas e trade-offs

- **Postgres via Supabase/Neon** em vez de banco próprio auto-hospedado: reduz tempo de setup e custo operacional para um projeto solo em estágio inicial. Trocar depois é possível sem reescrever a lógica de aplicação, só a camada de acesso a dados.
- **Scan sob demanda (MVP) em vez de agendado**: evita custo de API rodando sem controle antes de validar se o produto é usado de verdade. Agendamento entra no roadmap pós-MVP.
- **JSON estruturado direto do LLM em vez de pipeline de NLP próprio** (NER, classificação separada): mais rápido de construir, custo de precisão aceitável para v1. Se a qualidade da extração de entidades for um problema recorrente, vale revisitar com um passo de pós-processamento dedicado.
- **Scan em duas etapas (Coletor + Analista) em vez de uma chamada só**: separa "buscar/estruturar" de "cruzar setores". O Analista roda **sem busca web**, então só cruza notícias que o Coletor de fato encontrou — anti-alucinação de graça. Custo é ~2 chamadas, mas a 2ª é pequena (só os `items`, sem re-busca). Ver análise de custo do projeto.
- **OpenAI no MVP, Claude no fim**: decisão de custo para a fase inicial. O provider é isolado em `scan.ts`; os prompts (`scanPrompt.ts`) são provider-neutros, então a troca não mexe na lógica do produto.
- **Brief priorizado como superfície principal, grafo como camada secundária**: para o público-alvo (scout/estrategista, ver `produto.md` §2-3), a saída de valor é um memo rankeado — as oportunidades da semana com tese, *por que agora* e fontes rastreáveis — não uma rede para explorar às cegas. O ranqueamento hoje é por evidência (nº de notícias que sustentam a tese). O grafo (`buildGraph()` + D3) continua como visão de "explorar o mapa" / evidência de como as conexões se ligam, mas deixa de ser o headline. O `ScanResult` continua sendo a fronteira única: alimenta tanto o brief quanto o grafo, então essa mudança é de apresentação, não de contrato de dados.
- **`Insight` enriquecido com `why_now`**: o cruzamento vira tese quando tem timing (*por que agora*), além do *por que conecta* e do *e daí?*. Campo adicionado ao schema (§4); o Analista (`scanPrompt.ts`) o emite e os tipos de `@stalo/shared` (`Insight`), o `repo.ts` e `packages/server/db/schema.sql` acompanham (regras 3 e 4 do `CLAUDE.md`). Um score de confiança do cruzamento foi considerado e adiado para backlog (ver `notas.md`): a versão útil é objetiva (recorrência entre scans), que depende de histórico ainda não acumulado — a autoavaliação do LLM sozinha era subjetiva demais para exibir.
- **Deep dive reinventado como mapa de mercado (não um eco do brief)**: o mergulho tinha virado uma re-apresentação da tese (panorama ≈ rationale, "o que cruza" = as mesmas notícias, "por que conecta"/"e daí" idênticos ao brief) — só passos/sinais/financeiro eram novos. Reposicionado: onde o brief diz "aqui está o gap", o mergulho diz "quem já joga perto dele e onde o valor se acumula" — segundo andar de valor pro público scout/VC (`produto.md` §2). Estrutura nova: cabeçalho de tese enxuto (rationale/whyNow/soWhat da própria ideia, sem regenerar) → **cobertura ao longo do tempo** (gráfico) → **quem já joga aqui** → **onde o valor se acumula** → **jogadas análogas** → próximos passos → sinais → financeiro (2º nível). O mapa é gerado **com busca web** (`runDeepDive` agora usa `web_search`, como o Coletor), com trava anti-alucinação no prompt (só nomear players que encontrou, com fonte; "cenário aberto" quando acha pouco). O tipo `DeepDive` ganhou `market` e o "já mergulhado" checa `deepDive.market` — mergulhos salvos antes do redesenho re-geram na abertura. **Sem mudança de schema SQL** (`deep_dive` continua JSONB). O **gráfico de cobertura** é puro cliente (`CoverageChart`, histograma das notícias que sustentam a ideia por `published_at`), rotulado como *cobertura* — **nunca "tendência"** (tendência real exige recorrência entre scans, que não existe; mesma regra do `notas.md`).
- **Mergulho diferenciado por tipo de insight (dois eixos: tipo e lente)**: cada tipo faz uma pergunta central diferente, então o mergulho ganha visual e análise próprios — sem quebrar a taxonomia universal (que segue com glifos/cores fixos). Separação de eixos: **tipo** decide *quais perguntas* (o bloco `typeAnalysis`) + o *acento de cor* + um *herói animado* (masthead `DiveHero`, SVG+CSS); **lente** (founder/investor/explorer) segue decidindo o *tom* dentro das seções. Não vira matriz 3×3: 3 estruturas, cada uma temperada pela lente. Por tipo — **tendência** (verde, "onde estamos na curva": `estagio` [leitura qualitativa da IA, nunca número medido] + aceleradores/freios; herói = curva subindo); **gap** (vermelho, "por que o vão segue aberto": `porqueAberto` + `cemiterio` [quem tentou e morreu] + `aPonte`; herói = ponte cruzando o vão); **oportunidade** (âmbar, "por onde começar": `beachhead` + `menorTeste`; herói = cunha até o alvo). A espinha (tese, cobertura, mapa de mercado, passos, sinais, financeiro) e os botões de ação seguem universais. `runDeepDive` escolhe schema+prompt por `idea.type`; `DeepDive.typeAnalysis` é união discriminada por `kind`, e o "já mergulhado" checa `typeAnalysis` (mergulhos anteriores re-geram). Sem mudança de schema SQL.
- **Detalhe do insight como revelação progressiva (InsightStory), não bloco único**: feedback de uso apontou que a interface entregava a conclusão pronta sem o "caminho" do raciocínio. O detalhe de um insight (no brief e no painel do grafo — componente compartilhado `InsightStory` em `apps/web`) agora fase o conteúdo em etapas numeradas: **o padrão** (notícias relacionadas em ordem cronológica + mini-timeline por `published_at`, pra distinguir evento isolado de sequência) → **por que conecta** (`rationale`) → **por que agora** (`why_now`) → **e daí?** (`so_what`) → **ação** (salvar). Etapas fechadas são clicáveis; clicar numa etapa adiante revela tudo até ela. É mudança só de apresentação — nenhum campo removido, contrato do `ScanResult` intacto. Complemento: a lista de temas mostra a **atividade do scan atual** ("N notícias neste scan", contagem direta do último `ScanResult`) — deliberadamente rotulada como atividade, não "tendência": sinal de tendência real depende de recorrência entre scans, que exige o histórico de scans do backlog (ver `notas.md`, "Score de confiança do cruzamento").
- **Coleta sob demanda com LLM+busca em vez de pipeline volumoso (RSS/API de notícias)**: o valor do produto é curadoria + cruzamento, não volume (ver `produto.md`). Pipeline volumoso fica no backlog, só se cobertura/histórico/digest agendado virarem prioridade. **Exceção realizada — a newsletter:** o boletim semanal é justamente esse "digest agendado", então usa um modelo **híbrido RSS + LLM**. Um mapa curado `setor → feeds RSS` (mantido por nós, invisível ao assinante — ele só escolhe setores de um menu, **nunca inputa RSS**) coleta os itens com URL, data e imagem reais, baratos e sem alucinação; o LLM entra **só na síntese** — os 3 insights (tendência/gap/oportunidade) que cruzam as notícias de cada seção, preservando o "curadoria + cruzamento". A coleta do produto principal (veredito/scan) **não muda** — segue LLM+busca sob demanda. Detalhe do plano na nota "newsletter-plano-de-implem" (Maestri).
- **`max_tokens` fixo e prompt com limites explícitos** (máx. 8 notícias, máx. 3 insights por scan): decisão deliberada para manter respostas previsíveis e baratas; ajustar para cima só se o volume de temas monitorados crescer no roadmap.
- **Personalização por lente (perfil) mora no prompt do mergulho (`dive`), não no scan nem no brief**: o onboarding captura a lente do usuário (**founder / investidor / explorador** — a ideia de "público" de `produto.md` §2-3). As **categorias de insight continuam universais** (`tendência / gap / oportunidade` — mesmos glifos, cores e taxonomia em grafo, brief e mergulho); por isso **não é mudança no `type` do `Insight`** nem no schema de `insights`. O que muda por lente é a **linguagem de direcionamento** — o *"e daí?"/payoff*, os *passos* e o *2º nível financeiro* do mergulho — e a **ordem do brief** (qual categoria lidera é ranqueamento, não regeneração de texto). O **grafo permanece neutro** (é a superfície de triagem/mapa; a divergência por perfil precisa de densidade, e o mergulho é onde ela cabe). Consequência técnica: a lente vira **parâmetro do prompt do `dive`** (e do `financials`), threaded pelo módulo compartilhado de prompts (regra 4). Isso isola a personalização à geração sob demanda (barata, por insight) e preserva o "mesmo radar pra todo mundo" (comparabilidade). A lente é preferência de **navegador** (não por insight), guardada no `localStorage` (`apps/web/src/lib/storage.ts`, chave `stalo:settings`; ver decisão de dados do visitante em §7). **Implementado:** capturada no onboarding; o cliente lê a lente salva (`readLens()` em `apps/web/src/lib/api.ts`) e a manda no corpo de `POST /api/dive` e `POST /api/financials` junto com a ideia — as rotas não guardam estado, só repassam a lente pra `runDeepDive`/`runFinancials`, que ajustam o prompt (`buildDeepDiveSystemPrompt`/`buildFinancialsSystemPrompt` em `scanPrompt.ts`): founder puxa validação com cliente, investidor puxa diligência/deal, explorador puxa sinais a acompanhar; no financeiro, founder foca em bootstrap/receita, investidor em venture-scale/defensibilidade, explorador em por onde o dinheiro flui. Os esquemas de saída (mergulho e financeiro), o scan e o grafo seguem neutros; o **brief é reordenado por lente na apresentação** — o componente `Brief` põe a categoria que a lente lidera no topo (evidência como desempate), via `LENS_LEAD_CATEGORY` em `apps/web/src/lib/ui.ts`, com a lente lida do `localStorage`. É reordenação de apresentação: não regenera texto nem altera o contrato do `ScanResult`.
- **Autenticação removida (2026-08)**: o app teve Supabase Auth (Google + e-mail/senha) por um período; saiu porque (1) o projeto free do Supabase pausava por inatividade e derrubava login e banco juntos, (2) o Stalo é peça de portfólio sem plano de monetização — conta não pagava seu custo de fricção. O que segurava abuso (scan grátis único + convite de conta) virou **rate limit de 4 scans/2h por IP+cookie** (`apps/web/src/lib/rateLimit.ts`, `enforceScanLimit`, chaves duplas `scan:ip:*`/`scan:wid:*` na tabela `rate_limits`). O banco **continua** sendo o Postgres do Supabase; migração para Neon é follow-up independente.
- **Rate limit fora do banco (2026-08-11)**: o contador saiu do Postgres para o Upstash (Redis). Motivo: o projeto free do Supabase ficou inacessível e derrubou o contador junto com os dados — e, como o limite falhava ABERTA, cada tentativa de scan chamava a OpenAI sem teto e falhava depois, gastando sem entregar. Além do armazenamento, mudou a política: as rotas que chamam a IA (scan, dive, financials) passaram a **fail-closed** (503 quando o contador não responde); o resto segue fail-open. A chave por cookie foi removida — o cliente a controla, então só o IP segura de fato. Janela fixa e limites preservados (scan 4/2h, dive e financials 20/h). Como `INCR` e `EXPIRE` são duas chamadas separadas no Upstash (o upsert do Postgres era atômico), uma chave pode ficar sem TTL se o `EXPIRE` falhar; o contador se auto-repara, definindo a janela quando encontra uma chave sem validade.
- **Contador em memória, sem serviço externo (2026-08-12)**: um dia depois, o Upstash também saiu — o contador passou a viver em memória, no processo da função (`packages/server/src/memoryStore.ts`). Motivo: o objetivo do projeto é ser 100% grátis e simples, e trocar um serviço externo (Supabase) por outro (Upstash) andava contra isso. O que decidiu foi perceber o que o serviço externo realmente comprava: um limite por IP **nunca** protegeu contra abuso distribuído — quem quer queimar tokens troca de IP — então o ganho era estreito (consistência contra um mesmo IP entre instâncias do Vercel) e custava mais uma chave. **Trade-off assumido**: o contador é por instância e morre em cold start, então o limite é furado — segura uso casual e repetição acidental, não segura script determinado. A garantia financeira de verdade é o **teto de gasto mensal na OpenAI**, não o rate limit; isto aqui é fricção, não teto. A troca custou um arquivo porque tudo passa pela interface `RateLimitStore`: política, rotas, limites e testes não mudaram. Voltar para um store remoto é reimplementar a mesma interface. Considerada e descartada: a regra de rate limit do firewall da Vercel (grátis no Hobby, sem código), porque a janela máxima no plano é de 10 minutos e a política do produto é 4 scans por 2 horas — serve como tampa contra flood, não como o limite do produto.
- **Dados do visitante saem do Postgres, vão para o `localStorage` (2026-08)**: temas, último scan, ideias salvas (com deep dive e financeiro) e a lente pararam de ter tabela — moram só no navegador (`apps/web/src/lib/storage.ts`), lidos e validados pelo cliente antes de entrar na UI ou num prompt (o `localStorage` é entrada não confiável: qualquer pessoa edita pelo devtools). Motivo: o mesmo projeto free do Supabase que já tinha derrubado o login (ver "Autenticação removida" acima) derrubou também os dados em produção — segundo prejuízo do mesmo componente, com o app inteiro dependendo de um serviço que pausa por inatividade. As rotas `/api/*` que sobraram (`/api/scan`, `/api/dive`, `/api/financials`) viraram funções puras: recebem entrada, chamam a IA, devolvem resultado, sem guardar nada — quem persiste é o navegador. Saíram do repositório as funções de CRUD do visitante em `repo.ts`, as tabelas `topics`/`scans`/`news_items`/`insights`/`saved_ideas`/`workspace_settings` do schema, o cookie `stalo_wid` e o `apps/web/src/proxy.ts` que o criava — sem eles, não sobra isolamento por workspace pra fazer, porque não sobra dado nenhum no servidor pra isolar. **Trade-off assumido, dois pontos**: (1) **sem sincronização entre aparelhos** — abrir o Stalo num celular não traz o que foi salvo no notebook, cada navegador é uma cópia isolada; (2) mais sério, **sem backup** — limpar os dados do navegador (ou trocar de navegador/aparelho) apaga as ideias salvas de vez, sem volta, coisa que o Postgres cobria antes. Um botão de exportar/importar as ideias em JSON mitigaria o ponto 2 e ficou deliberadamente de fora deste corte — é **follow-up conhecido**, a entrar assim que o resto estabilizar (ver `artefatos/specs/2026-08-11-sem-banco-design.md`, "Riscos assumidos"). O que continua no Postgres é só a newsletter (`subscribers`, `newsletter_editions`, §4) — mailing list global sem relação com o workspace do visitante, removida num plano futuro junto com o e-mail.

## 8. Como começar a implementar

Ordem escolhida (frontend primeiro com dados mockados, para validar a UI antes de investir em infraestrutura de dados/LLM):

1. Setup do projeto: Next.js (App Router) com TypeScript e Tailwind, resolvendo frontend + backend no mesmo projeto (rotas `/api/*` viram os endpoints do backend mais adiante).
2. Frontend com dados mockados: portar a UI do protótipo (topics sidebar, grafo D3, painel de detalhe, ideias salvas) trocando `window.storage` por estado local/`localStorage` e o `scanNews()` real por uma função que retorna um `ScanResult` mockado (mesmo formato de JSON da seção 6), para validar a experiência completa sem depender de banco nem da Claude API.
3. **[feito]** Endpoint `POST /api/scan` no servidor com o "encaixe" do provider (`runScan`) e o prompt no módulo compartilhado — porém ainda servido por mock, porque a API de IA não foi escolhida. O frontend já consome o endpoint via `fetch` (não gera mais os dados no client).
4. **[em andamento]** Plugar a API de IA em `runScan`: **OpenAI** (Responses API) em duas etapas (Coletor com `web_search` + Analista), structured outputs por schema Zod, e validação em código. `OPENAI_API_KEY` em variável de ambiente no servidor. Falta configurar a key e testar ponta a ponta; troca para Claude planejada para o fim do MVP.
5. **[feito, depois revertido]** Banco de dados: projeto no Supabase, acesso via `packages/server/src/db.ts` (postgres.js) + `packages/server/src/repo.ts`. Na época, o `localStorage` (temas, ideias, último scan) foi trocado pelos endpoints `/api/topics`, `/api/ideas`, `/api/scan` e `/api/scan/latest`. **Revertido em 2026-08**: esses dados voltaram para o `localStorage` e essas rotas foram removidas — ver a decisão "Dados do visitante saem do Postgres, vão para o `localStorage`" em §7. O que ficou no Postgres é só a newsletter (§4).
6. Deploy: Vercel + a variável de ambiente da chave de IA configurada no painel do Vercel, nunca no código.