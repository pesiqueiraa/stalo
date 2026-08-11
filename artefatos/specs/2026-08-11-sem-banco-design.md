# Stalo sem banco — boletim na web, dados no navegador

**Data:** 2026-08-11
**Status:** desenho aprovado, aguardando plano de implementação

## Objetivo

Tirar o Postgres do Stalo. O app continua 100% grátis e sem login, mantém um freio de custo de IA real, e o boletim semanal deixa de ser e-mail e passa a ser uma página do site.

O gatilho foi operacional: o projeto free do Supabase ficou inacessível (`XX000 — tenant/user not found`) e derrubou todas as rotas de dados em produção, com a landing de pé. É o segundo prejuízo causado pelo mesmo componente — o primeiro tinha sido a remoção da autenticação, em agosto de 2026.

## Fora de escopo

- Login, contas, multi-usuário. Continua anônimo (`produto.md` §2).
- Sincronizar dados entre aparelhos.
- Exportar/importar as ideias salvas em JSON. Fica como follow-up (ver Riscos).
- Trocar o provedor de LLM. Segue OpenAI; o ponto de plugue continua em `scan.ts`.

## Arquitetura

### Onde cada dado passa a morar

| Hoje (Postgres) | Depois | Por quê |
|---|---|---|
| `topics` | localStorage | é preferência de quem está no navegador |
| `scans` + `news_items` + `insights` | localStorage (último scan) | a UI só mostra o último |
| `saved_ideas` (+ deep dive, financials) | localStorage | idem |
| `workspace_settings` | localStorage | idem |
| `subscribers` | **deixa de existir** | sem e-mail, sem lista |
| `newsletter_editions` | Upstash (`boletim:<semana>`) | precisa sobreviver entre o cron e a visita |
| `rate_limits` | Upstash | contador precisa de estado compartilhado no servidor |

Saem do repositório: `packages/server/src/db.ts` (50 linhas), `repo.ts` (430), `db/schema.sql` (148), `send.ts`, `render.ts`, e as dependências `postgres` e `resend`.

### O que sobra no servidor

As rotas `/api/*` viram funções puras: recebem entrada, chamam a OpenAI, devolvem resultado. Não guardam estado de usuário.

| Rota | Antes | Depois |
|---|---|---|
| `/api/scan` | roda, persiste, devolve | roda e devolve; quem salva é o navegador |
| `/api/ideas/[id]/dive` | lê a ideia do banco | vira `/api/dive`, recebe a ideia no corpo |
| `/api/ideas/[id]/financials` | idem | vira `/api/financials`, idem |
| `/api/newsletter/send` | monta e envia por e-mail | vira `/api/boletim/gerar`: monta e grava no Upstash |
| `/api/topics`, `/api/settings`, `/api/ideas`, `/api/scan/latest` | CRUD no banco | **deixam de existir** — viram leitura local |
| `/api/newsletter`, `/preview`, `/test`, `/unsubscribe` | captura e envio | **deixam de existir** |

De 14 rotas para 4.

### Identidade do visitante

O cookie `stalo_wid` e o `proxy.ts` são removidos. Com os dados no navegador, o cookie não isola mais nada — sobraria só como segunda chave do rate limit, e essa metade é contornável por qualquer script que mande um UUID novo a cada requisição. O limite passa a ser declaradamente por IP.

### `lib/storage.ts` (novo)

Módulo único de leitura e escrita do localStorage, tipado por chave.

Regra central: **o conteúdo do localStorage é entrada não confiável.** Qualquer pessoa edita pelo devtools. Tudo que sai de lá é validado contra a forma esperada; o que não bater é descartado e a chave reinicializada, em vez de propagar dado quebrado para a UI ou para dentro de um prompt.

Chaves: `stalo:topics`, `stalo:scan`, `stalo:ideas`, `stalo:settings`. Cada uma com número de versão, para uma mudança de formato futura poder migrar ou descartar sem quebrar a tela de quem já tem dado salvo.

### Rate limit no Upstash

Contador por IP em **janela fixa** — a mesma semântica do `checkRateLimit` atual, que faz upsert atômico no Postgres. Chave `rl:<bucket>:<ip>`, TTL igual à janela, incremento atômico do Redis no lugar do upsert. Manter a janela fixa (em vez de partir para deslizante) preserva o comportamento e os limites já testados: a troca é de armazenamento, não de política.

Limites mantidos: scan 4 por 2h; dive e financials 20 por hora.

**Mudança de política:** o comportamento quando o Upstash falha passa a ser **fail-closed nas rotas que chamam a IA** (scan, dive, financials) e fail-open no resto. Hoje é fail-open em tudo, e foi exatamente isso que transformou a queda do banco num vazamento de dinheiro: o limite deixou de valer, a OpenAI foi chamada, a persistência falhou depois, e cada tentativa custou sem entregar nada. Numa rota cara, o padrão certo é errar para o lado de não gastar.

### Boletim

Roda por cron (`vercel.json`, segunda 12h UTC) chamando `/api/boletim/gerar`, protegido pelo `CRON_SECRET` que já existe, fail-closed.

Pipeline (inalterado): `ingestSectors` puxa RSS — de graça, sem IA — e o Analista cruza. Duas origens (BR e GRINGA) = **2 chamadas de IA por semana**, custo fixo e previsível. Antes escalava por combo de setores de cada assinante.

O resultado vai para o Upstash em `boletim:<weekStart>`, com `boletim:latest` apontando para a semana corrente. A página `/boletim` só lê a chave: abre instantâneo e nunca chama a IA, por mais visita que receba.

**Rodízio de setores.** Sem assinantes escolhendo, a lista é fixa por semana e vem de um rodízio determinístico: uma lista de combinações curadas no código, e a semana escolhe qual por `Math.floor(Date.parse(weekStart) / 604800000) % combos.length`. Determinístico (mesma semana → mesma combinação, testável sem congelar o relógio) e curado (cada combinação é um recorte que faz sentido cruzar, não sorteio entre os 12 setores).

**Página `/boletim`:** rota própria, link no menu da landing. Tem URL para compartilhar e indexável. Renderiza com os componentes e o CSS do site — o template de e-mail (`render.ts`, tabelas e estilo inline) não é reaproveitado.

**Estado vazio:** se ainda não existe edição gravada, a página mostra a última que houver; se nunca rodou, mostra `sampleEdition()` identificada como exemplo. Nunca gera na hora.

`sampleEdition()` hoje mora dentro de `render.ts`, que é template de e-mail e vai ser removido. Antes de apagar, extrair para `packages/server/src/sampleEdition.ts` — é dado de exemplo, não renderização, e continua útil para a página e para os testes.

## Segurança

Itens da auditoria de 2026-08-11 e o que acontece com cada um:

| # | Item | Destino |
|---|---|---|
| 1 | `/api/newsletter/preview` público chamando IA | rota deixa de existir |
| 2 | limite duplo que na prática é só por IP | vira explicitamente por IP; o cookie sai |
| 3 | rate limit fail-open | fail-closed nas rotas de IA; Upstash não pausa por inatividade |
| 4 | newsletter sem double opt-in | deixa de existir (sem e-mail) |
| 5 | descadastro por GET | deixa de existir |
| 6 | cookie aceito sem validação de formato | deixa de existir |
| 7 | `.env.example` incompleto | reescrito para o novo conjunto |

Cinco dos sete somem por remoção, não por correção — é a superfície encolhendo.

**O app deixa de coletar qualquer dado pessoal.** Sem e-mail, sem cookie de identidade, sem PII no servidor.

**Risco novo criado por este desenho:** as rotas passam a receber do cliente o conteúdo que vai para o prompt (a ideia salva no corpo do `/api/dive`). Isso abre um caminho para queimar tokens com payload grande. Toda rota que chama a IA valida forma e impõe teto de tamanho na entrada antes de montar o prompt.

**Envs depois da mudança:** `OPENAI_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `CRON_SECRET`, `APP_URL`. Saem `DATABASE_URL`, `RESEND_API_KEY`, `NEWSLETTER_FROM`, `NEWSLETTER_ADMIN_SECRET`. O `.env.example` passa a listar todas.

## Testes

Saem os testes que mockam `repo`/`db` (5 arquivos). Entram:

- `storage.ts`: round-trip por chave; dado corrompido reinicializa em vez de quebrar; versão antiga é descartada.
- rate limit: conta, bloqueia no limite, expira com a janela, e **fail-closed** quando o Upstash não responde (contra um fake, sem rede).
- rodízio do boletim: a mesma semana devolve sempre a mesma combinação; semanas seguidas avançam e dão a volta.
- rotas de IA: rejeitam payload acima do teto e forma inválida antes de chamar o provedor.

Os testes de `scan`, `validate`, `rss`, `enrich` e `render` que não tocam banco continuam.

## Riscos assumidos

- **Sem backup das ideias salvas.** Limpar dados do navegador apaga tudo, e agora não existe cópia no servidor. Antes o Postgres era essa cópia — é a única regressão real desta mudança. Mitigação natural é um botão de exportar JSON; ficou fora do escopo por decisão, e deve entrar assim que o resto estabilizar.
- **Dados não passam de aparelho para aparelho.** Igual ao comportamento de hoje na prática, já que o cookie nunca saiu de um navegador.
- **O boletim perde o cache por combo.** Irrelevante: uma execução por semana.
- **Upstash é dependência externa nova.** Menor que o Postgres (sem schema, sem migração, sem pausa por inatividade), mas se cair, as rotas de IA passam a recusar — que é a escolha consciente de fail-closed.

## Ordem de implementação sugerida

0. Extrair `sampleEdition()` de `render.ts` para módulo próprio.
1. `lib/storage.ts` com testes, ainda sem trocar nada de lugar.
2. Migrar UI para o storage local; remover as 4 rotas de CRUD e `page.tsx` do servidor.
3. Rate limit no Upstash, fail-closed nas rotas de IA.
4. Boletim: rota de geração, chave no Upstash, página `/boletim`, rodízio.
5. Remover Resend, `subscribers`, popup e as rotas de newsletter.
6. Remover `db.ts`, `repo.ts`, `schema.sql` e as dependências; atualizar `.env.example`.
7. Atualizar `arquiteturad.md`, `produto.md`, `roadmap.md` e o README.

Cada passo mantém a suíte verde. O passo 6 só acontece quando nada mais importa o `@stalo/server` para banco.
