# Stalo — o radar de tendências

Escolha os setores de tecnologia que você acompanha. O Stalo busca as notícias recentes de cada um, cruza os setores entre si e devolve as tendências, gaps e oportunidades que aparecem no meio do caminho — cada uma com a tese e as fontes que a sustentam. O que te interessar, você salva como ideia de negócio.

## Por que eu construí isso

Eu queria acompanhar notícias de vários setores ao mesmo tempo para tirar dali ideias de produto, e nunca conseguia. Ler tudo manualmente não escala: são cinco feeds diferentes, todos lineares, e no fim do dia você leu muita coisa e não tirou nada dali.

O problema não era o volume — era o formato. A informação que eu queria não estava dentro de nenhuma notícia isolada; estava no **cruzamento** entre duas notícias de setores diferentes, que ninguém coloca lado a lado porque estão em feeds separados. É exatamente esse tipo de conexão que um feed linear esconde e que vira ideia de produto.

Então fiz a ferramenta que eu queria usar: ela lê por mim, procura onde os setores se tocam, e me entrega o cruzamento já com o "e daí?" explícito e o link da fonte para eu conferir.

## O que ele faz

- **Temas monitorados** — até 5 setores, adicionados e removidos na hora.
- **Scan sob demanda** — duas etapas de IA: um Coletor busca notícias na web, um Analista cruza os setores e extrai tendências, gaps e oportunidades.
- **Brief priorizado** — a saída principal: as oportunidades da rodada rankeadas, cada uma com tese e fontes.
- **Grafo (D3)** — notícias como nós coloridos por tema, insights destacados, arestas por palavra-chave compartilhada. É a camada de explorar o mapa, não o protagonista.
- **Ideias salvas** — qualquer insight vira um item guardado, com deep dive e análise financeira sob demanda.
- **Boletim por e-mail** — resumo periódico, disparado por cron.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, D3 |
| Backend | `@stalo/server` — rotas `/api/*` finas no Next chamam a lógica do pacote |
| Banco | Postgres (Supabase) |
| LLM | OpenAI (Responses API + tool `web_search`) |
| Testes | Vitest |
| Deploy | Vercel |

Monorepo com npm workspaces — `apps/web` (UI + rotas de API), `packages/server` (banco, scan, prompts), `packages/shared` (tipos do domínio). Comandos rodam da raiz.

## Sem contas, com limites

O app é anônimo: cada visitante ganha um workspace por cookie (`stalo_wid`, 1 ano) e só enxerga os próprios temas, scans e ideias. Não há login — o custo de fricção de uma conta não se pagava num projeto sem monetização.

Como não há conta segurando o custo de IA, quem segura é o rate limit. O scan (o endpoint caro, que faz busca web) é limitado a **4 por janela de 2 horas**, com chave dupla em IP **e** cookie: apagar o cookie não renova, trocar de IP não renova. O limite é checado antes da chamada à OpenAI, então um 429 não gasta nada. Deep dive e análise financeira têm limites próprios por IP.

A chave da OpenAI vive só no servidor e nunca chega ao client.

## Como rodar

```bash
git clone https://github.com/pesiqueiraa/stalo.git
cd stalo
npm install

cp apps/web/.env.example apps/web/.env
# preencher OPENAI_API_KEY, DATABASE_URL, UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN

npm run dev
```

O schema do banco está em `packages/server/db/schema.sql`. Sem `OPENAI_API_KEY` e `DATABASE_URL` o app sobe, mas o scan não roda. O rate limit (scan, dive, financials) usa o Upstash Redis; sem `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` essas rotas devolvem **503** em vez de rodar — a política é fail-closed (sem contador de pé, é mais barato recusar do que chamar a IA sem teto).

```bash
npm test        # Vitest
npm run typecheck
npm run build
```

## Documentação

| Arquivo | Conteúdo |
|---|---|
| [`artefatos/produto.md`](./artefatos/produto.md) | Problema, usuário-alvo, escopo do MVP |
| [`artefatos/arquiteturad.md`](./artefatos/arquiteturad.md) | Stack, modelo de dados, fluxo, decisões e trade-offs |
| [`artefatos/roadmap.md`](./artefatos/roadmap.md) | Checklist do MVP e backlog |
| [`artefatos/notas.md`](./artefatos/notas.md) | Ajustes de UX pendentes e ideias soltas |

## Licença

MIT — veja [`LICENSE`](./LICENSE).
