# Roadmap — Stalo (o radar de tendências)

## MVP (v1) — checklist de implementação

Objetivo: sair do protótipo em artifact para uma versão real, hospedada, com dados persistidos com segurança. Escopo funcional igual ao protótipo — a mudança aqui é de infraestrutura, não de feature.

Ordem de implementação escolhida: primeiro validar o frontend inteiro com dados mockados (sem depender de banco nem da Claude API), só depois construir o backend real. Isso permite ver a UI rodando cedo e trocar o mock pelos endpoints reais sem reescrever a camada de visualização.

- [x] Setup do projeto (frontend + backend, ver `artefatos/arquiteturad.md`)
- [x] Frontend com grafo D3 rodando sobre dados mockados (topics, scan, ideias salvas simuladas em memória/localStorage, sem chamar API real)
- [x] Banco de dados provisionado com o schema inicial (Supabase; SQL em `packages/server/db/schema.sql`)
- [x] Endpoint de scan funcionando ponta a ponta (prompt → LLM → parse → persistência) — OpenAI em duas etapas (Coletor com `web_search` + Analista), testado com a `OPENAI_API_KEY` real (busca + JSON estrito + persistência confirmados). Troca para Claude planejada para o fim do MVP
- [x] Endpoint de temas (add/remove, limite de 5)
- [x] Endpoint de ideias salvas (criar/listar/remover)
- [x] Frontend trocando os dados mockados pelos endpoints reais
- [ ] Deploy funcionando com API key protegida em variável de ambiente
- [x] Teste manual do fluxo completo: adicionar tema → escanear → ver grafo → salvar insight → recarregar página → confirmar que persistiu (verificado via endpoints contra o Supabase)

**Definição de pronto do MVP:** dá pra usar a ferramenta no dia a dia, sem depender do ambiente de artifacts, e os dados sobrevivem entre sessões.

## Backlog pós-MVP

Sem ordem de prioridade fixa — organizado por tema, para revisitar depois que o MVP estiver validado em uso real.

### Automação e frescor dos dados
- Scan agendado (cron) em vez de só sob demanda, com frequência configurável por tema.
- Digest por e-mail com o resumo do scan mais recente.
- Deduplicação semântica entre notícias de scans diferentes (evitar repetir a mesma notícia reformulada).

### Qualidade dos insights
- Pontuação/priorização automática das ideias salvas (ex: "quantos scans essa conexão já apareceu").
- Espaço para o usuário anotar aprendizados em cada ideia salva (campo `notes` já previsto no schema) e marcar status: "a validar", "validando", "descartada", "virou hipótese de startup".
- Permitir feedback do usuário sobre a qualidade de um insight (útil/não útil), para eventualmente calibrar o prompt.
- Personalização por lente/perfil (**founder / investidor / explorador**, capturada no onboarding): a lente parametriza a **linguagem de direcionamento do mergulho** e, opcionalmente, o **ranqueamento do brief**; o **grafo** e a **taxonomia de categorias** (tendência/gap/oportunidade) permanecem neutros/universais. **Implementado:** persistência da lente (`workspace_settings`) e prompts do mergulho **e** do 2º nível financeiro ajustados por lente. **Falta (opcional):** ranqueamento do brief por lente. Decisão em `arquiteturad.md` §7.

### Alcance e colaboração
- Multi-usuário com autenticação (login simples por e-mail/magic link). _(O app chegou a ter Supabase Auth — Google + e-mail/senha — implementado ponta a ponta, com backend e persistência, e foi removido em 2026-08 por decisão de produto (ver `arquiteturad.md` §7); se voltar, é reimplementação do zero, não retomar um stub.)_
- Times/workspaces compartilhados — mais de uma pessoa acompanhando o mesmo radar.
- Exportação de ideias salvas para Notion/Google Docs/Slack.

### Produto e UX
- Busca/filtro dentro do grafo quando o número de nós crescer.
- Histórico de scans navegável (não só o mais recente).
- Modo "comparar setores" — visualização focada só nas conexões entre dois temas específicos.
- Versão mobile responsiva dedicada (o MVP prioriza desktop).

### Técnico
- Camada de cache para não rechamar a API em buscas muito próximas no tempo sobre os mesmos temas.
- ~~Rate limiting no endpoint de scan (evitar custo descontrolado de API).~~ **Implementado** (por IP, contador em Postgres) nos endpoints de IA — scan, dive e financials — quando o app foi a público.
- Observabilidade básica: logs de erro de parsing de JSON do LLM, taxa de sucesso dos scans.

## Fora de escopo por enquanto (não é objetivo do produto)

- Virar um agregador de notícias genérico (o valor está na curadoria + cruzamento, não no volume).
- Automatizar a decisão de "vale a pena virar startup" — o produto gera hipóteses, a validação com pessoas reais continua sendo trabalho humano, de propósito.