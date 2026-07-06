# Stalo — o radar de tendências

Ferramenta que monitora setores de tecnologia escolhidos pelo usuário, cruza notícias entre eles usando um LLM com busca web, visualiza tudo como um grafo de conexões e deixa salvar tendências/gaps/oportunidades identificadas como ideias de negócio.

## Status atual

🟡 **Protótipo funcional (MVP validado como artifact)** — já existe uma versão navegável rodando 100% no client-side (HTML + JS + D3), usada para validar o conceito antes de investir em backend/infra. Este repositório é o próximo passo: transformar o protótipo em um produto real, com persistência própria e a chave de API protegida no servidor.

## Documentos deste repositório

| Arquivo | Conteúdo |
|---|---|
| [`artefatos/produto.md`](./artefatos/produto.md) | Problema, usuário, escopo do MVP (o que entra e o que fica de fora) |
| [`artefatos/arquiteturad.md`](./artefatos/arquiteturad.md) | Stack técnica, modelo de dados, fluxo de dados, decisões e trade-offs |
| [`artefatos/roadmap.md`](./artefatos/roadmap.md) | Checklist do MVP e backlog de features futuras |
| [`artefatos/notas.md`](./artefatos/notas.md) | Ajustes de UX pendentes no MVP e ideias soltas pra depois |

Comece pelo `artefatos/produto.md` se quiser entender o *o quê* e o *por quê*. Vá direto pro `artefatos/arquiteturad.md` se quiser entender o *como*.

## Pitch em uma frase

Um radar que lê as notícias de tecnologia por você, encontra onde os setores se cruzam, e transforma esse cruzamento em ideias de startup prontas pra validar.

## Stack (proposta — ver `artefatos/arquiteturad.md` para detalhes e alternativas)

- **Frontend:** Next.js (App Router) + TypeScript + Tailwind CSS + D3 (visualização de grafo)
- **Backend:** Node.js (rotas de API) — proxy seguro para a Claude API
- **Banco de dados:** Postgres (via Supabase ou Neon)
- **LLM:** Claude API com a ferramenta de busca web nativa (`web_search`)
- **Deploy:** Vercel (frontend + funções serverless) + banco gerenciado

## Estrutura do repositório

Monorepo com npm workspaces:

- `apps/web` — app Next.js (frontend + rotas `/api/*` finas)
- `packages/server` — backend: acesso ao banco, persistência e o scan (busca web + IA)
- `packages/shared` — tipos do domínio, compartilhados entre os dois

Os comandos (`dev`, `build`, `typecheck`, `lint`) rodam da raiz.

## Como rodar

```bash
# 1. Clonar e instalar (na raiz — os npm workspaces cuidam de tudo)
git clone <url-do-repo>
cd stalo
npm install

# 2. Configurar variáveis de ambiente (no app web)
cp apps/web/.env.example apps/web/.env
# preencher OPENAI_API_KEY e DATABASE_URL

# 3. Rodar localmente (da raiz)
npm run dev
```

> O scan usa a OpenAI (busca web + IA) e persiste no Postgres, então `OPENAI_API_KEY` e `DATABASE_URL` são necessários para o fluxo completo.

## Protótipo de referência

O protótipo original (artifact standalone, sem backend) está descrito no `artefatos/arquiteturad.md` na seção "O que já existe". Ele serve como especificação viva do comportamento esperado da interface e da lógica de geração de insights — use-o como referência ao implementar a versão real.

## Licença

A definir.