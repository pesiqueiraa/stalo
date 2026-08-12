# CLAUDE.md

Contexto persistente para o Claude Code (ou qualquer agente de IA) trabalhando neste repositório. Mantenha este arquivo curto — para detalhes, siga os links abaixo em vez de duplicar conteúdo aqui.

## O que é este projeto

Stalo — o radar de tendências: ferramenta que monitora setores de tecnologia escolhidos pelo usuário, usa um LLM com busca web para cruzar notícias entre eles, visualiza como grafo, e deixa salvar tendências/gaps/oportunidades como ideias de negócio.

## Estado atual do repositório

🟢 **Frontend completo + scan real (OpenAI) plugado + dados do visitante sem banco.** **Monorepo com npm workspaces:** `apps/web` (frontend Next.js — UI + rotas `/api/*` finas, sem estado), `packages/server` (backend: scan/OpenAI, prompts, newsletter — `@stalo/server`) e `packages/shared` (tipos do domínio — `@stalo/shared`). A UI completa (temas, scan, grafo D3, detalhe, ideias salvas) **persiste no `localStorage` do navegador** (`apps/web/src/lib/storage.ts`) — não há workspace, cookie nem conta; sem sincronização entre aparelhos e sem backup (ver `artefatos/arquiteturad.md` §7). O **scan** roda em duas etapas de IA reais — Coletor (busca web) + Analista (cruzamento) — em `packages/server/src/scan.ts`, via **OpenAI** (Responses API), com prompts em `packages/server/src/scanPrompt.ts`; a rota `POST /api/scan` não guarda nada, só devolve o resultado. `packages/server/src/db.ts` + `repo.ts` (schema em `packages/server/db/schema.sql`) restam só para a **newsletter** (mailing list + edição semanal), até um plano futuro removê-la. Decisão: OpenAI no MVP (mais barato), troca para Claude no fim (o ponto de plugue é `scan.ts`). O protótipo original (HTML+JS+D3 standalone) que serviu de especificação está em `artefatos/prototype.html`.

## Onde encontrar o quê

| Pergunta | Documento |
|---|---|
| Por que esse produto existe, para quem, o que é MVP vs. fora de escopo | `artefatos/produto.md` |
| Stack, modelo de dados, endpoints, fluxo de dados, decisões técnicas | `artefatos/arquiteturad.md` |
| O que falta implementar no MVP, backlog de features futuras | `artefatos/roadmap.md` |
| Ajustes de UX pendentes no MVP e ideias soltas pra depois | `artefatos/notas.md` |
| Pitch geral e como rodar o projeto | `README.md` |

Não duplique o conteúdo desses arquivos aqui — se uma instrução persistente for necessária, adicione neste arquivo; se for contexto de produto ou arquitetura, atualize o documento correspondente.

## Stack (ver `artefatos/arquiteturad.md` para o racional completo)

- Estrutura: **monorepo com npm workspaces** — `apps/web` (`@stalo/web`), `packages/server` (`@stalo/server`), `packages/shared` (`@stalo/shared`). Comandos rodam da raiz (`npm run dev`/`build`/`typecheck`).
- Frontend: Next.js (App Router) + TypeScript + Tailwind CSS + D3 (visualização de grafo), em `apps/web/`
- Backend: lógica em `packages/server` (scan/OpenAI, newsletter, prompts), consumida por rotas `/api/*` finas e sem estado no `apps/web`. Um dia pode virar serviço próprio, mas hoje roda no mesmo processo do Next (1 deploy).
- Banco: Postgres (Supabase ou Neon) — só para a newsletter; os dados do visitante vivem no `localStorage`
- LLM: **OpenAI** (Responses API + tool `web_search`) no MVP; troca planejada para Claude API no fim do MVP. O provider é isolado em `packages/server/src/scan.ts` (ponto único de plugue).
- Deploy: Vercel

## Regras que nunca podem ser quebradas

1. **A chave da llm escolhida nunca aparece no código nem em nada que rode no client.** Toda chamada à API de IA (hoje OpenAI, amanhã Claude) acontece no backend. Se uma tarefa parecer exigir a key no frontend, pare e sinalize — é sinal de que a arquitetura da tarefa está errada, não que a regra deve ser flexibilizada.
2. **Não introduza autenticação/multi-usuário sem que isso seja pedido explicitamente.** O MVP é single-user por decisão de produto (ver `artefatos/produto.md`, seção 2). Isso simplifica schema, endpoints e UI — não adicione `user_id` ou login "para o futuro" antecipadamente.
3. **Mudança no schema do banco sempre acompanha atualização em `artefatos/arquiteturad.md`.** O SQL na seção 4 desse documento é a fonte da verdade; nunca deixe o código e o documento divergirem.
4. **Os prompts do scan (Coletor e Analista) vivem em um único módulo compartilhado** (`packages/server/src/scanPrompt.ts`), não duplicados entre lugares diferentes do backend, e provider-neutros. Ao alterá-los, valide que os campos descritos continuam compatíveis com `NewsItem`/`Insight` e com `buildGraph()` no frontend.
5. **Ao implementar uma feature do backlog (`artefatos/roadmap.md`), confirme com o usuário antes** — o roadmap é uma lista de ideias, não um compromisso de escopo.

## Convenções de código (ajustar conforme o projeto evolui)

- TypeScript em frontend e backend.
- Nomeação de endpoints e tabelas em inglês; textos voltados ao usuário (UI, mensagens de erro) em português, seguindo o tom já usado no protótipo (direto, sem jargão desnecessário).
- Erros do LLM (JSON malformado, parse falho) sempre tratados com fallback visível ao usuário — nunca falhar silenciosamente (ver tratamento de erro no protótipo, referenciado em `artefatos/arquiteturad.md`).
- Commits sempre com na linha de conventional commits e em pt-bt

## Como trabalhar aqui

- Ao adicionar uma funcionalidade nova, primeiro confira se ela já está descrita como MVP, backlog ou fora de escopo em `artefatos/produto.md`/`artefatos/roadmap.md`, para não implementar algo fora do momento certo do produto.
- Prefira consultar `artefatos/arquiteturad.md` a inferir a arquitetura a partir do código quando o projeto ainda estiver pequeno — o documento é a fonte da verdade até que o código a substitua na prática.