# Dados no navegador — Plano de Implementação

> **Para quem for implementar:** os passos usam checkbox (`- [ ]`) para acompanhamento. Um commit por tarefa, e a suíte verde antes de cada commit.

**Goal:** Tirar os dados do visitante (temas, último scan, ideias salvas, preferências) do Postgres e colocá-los no `localStorage`, devolvendo o `stalo.dev` ao ar sem depender do banco.

**Architecture:** `apps/web/src/lib/api.ts` é a costura: todos os 14 componentes da UI falam só com as 13 funções dele. Preservando as **assinaturas e os tipos de retorno**, a UI não muda — só o miolo de cada função troca `fetch` por leitura/escrita local. As rotas que sobram deixam de guardar estado: recebem entrada, chamam a IA, devolvem resultado.

**Tech Stack:** Next.js (App Router), TypeScript, Vitest.

Este é o **plano 2 de 3** da spec `artefatos/specs/2026-08-11-sem-banco-design.md`. O plano 1 (rate limit fora do banco) já está na `main`. Este é o que devolve o site ao ar: hoje `/api/topics`, `/api/settings`, `/api/ideas` e `/api/scan/latest` devolvem 500 porque o projeto do Supabase está inacessível.

Ao final dele, o Postgres só é usado pela newsletter — que o plano 3 remove junto com o e-mail.

## Global Constraints

- Textos de UI e mensagens de erro em **português**, tom direto (CLAUDE.md).
- Commits em **conventional commits, em pt-BR** (CLAUDE.md).
- A chave de IA **nunca** chega ao client (CLAUDE.md, regra 1). Depois desta mudança o servidor guarda menos, mas continua sendo o único que fala com a OpenAI.
- Erro nunca falha em silêncio: sempre há mensagem visível ao usuário (CLAUDE.md).
- Mudança de schema acompanha atualização em `artefatos/arquiteturad.md` (CLAUDE.md, regra 3).
- **O conteúdo do `localStorage` é entrada não confiável.** Qualquer pessoa edita pelo devtools. Tudo que sai de lá é validado; o que não bater é descartado, não propagado para a UI nem para dentro de um prompt.
- Limites de rate limit preservados: scan 4/2h; dive e financials 20/h, ambos `failClosed`.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `apps/web/src/lib/storage.ts` (criar) | leitura/escrita tipada e validada do `localStorage`, versionada por chave |
| `apps/web/src/lib/storage.test.ts` (criar) | round-trip, dado corrompido, versão antiga |
| `apps/web/src/lib/api.ts` (modificar) | mesma superfície pública; o miolo passa a ser local, menos scan/dive/financials |
| `apps/web/src/app/api/dive/route.ts` (criar) | recebe a ideia no corpo, devolve o mergulho — sem estado |
| `apps/web/src/app/api/financials/route.ts` (criar) | idem, para a análise financeira |
| `apps/web/src/lib/aiPayload.ts` (criar) | validação de forma e teto de tamanho da entrada das rotas de IA |

Apagados: `apps/web/src/app/api/topics/**`, `api/settings/**`, `api/ideas/**`, `api/scan/latest/**`, `src/proxy.ts`, `src/lib/workspace.ts`, `src/lib/workspaceCookie.ts`.

---

### Task 1: `storage.ts` — o cofre local

**Files:**
- Create: `apps/web/src/lib/storage.ts`
- Create: `apps/web/src/lib/storage.test.ts`

**Interfaces:**
- Consumes: tipos `Topic`, `ScanResult`, `SavedIdea`, `Lens` de `@stalo/shared`.
- Produces:
  - `readTopics(): Topic[]` / `writeTopics(topics: Topic[]): void`
  - `readScan(): { result: ScanResult | null; createdAt: string | null }` / `writeScan(result: ScanResult): void`
  - `readIdeas(): SavedIdea[]` / `writeIdeas(ideas: SavedIdea[]): void`
  - `readLens(): Lens | null` / `writeLens(lens: Lens): void`
  - `hasAnything(): boolean` — usado pela landing e pelo radar para decidir onboarding vs. produto

**Contexto para quem implementa:** este módulo é a única parte do app que toca `localStorage`. Três regras que o resto do plano assume:

1. **Roda só no cliente.** `localStorage` não existe no servidor; toda leitura começa com um guard `typeof window === "undefined"` e devolve o vazio.
2. **O que sai de lá é entrada não confiável.** Valide forma antes de devolver. Um `JSON.parse` que devolve `{"topics": "haha"}` não pode virar `topics.map(...)` na UI nem texto dentro de um prompt.
3. **Versione.** Cada chave guarda `{ v: 1, data: ... }`. Versão diferente da atual é descartada, não migrada — não há dado precioso aqui, e migração especulativa é código morto.

- [ ] **Step 1: Escreva o teste que falha**

Crie `apps/web/src/lib/storage.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { hasAnything, readIdeas, readLens, readTopics, writeIdeas, writeLens, writeTopics } from "./storage";

// jsdom dá um localStorage de verdade; limpamos entre os testes.
beforeEach(() => localStorage.clear());

describe("storage", () => {
  it("round-trip de temas", () => {
    writeTopics([{ id: "1", name: "IA" }]);
    expect(readTopics()).toEqual([{ id: "1", name: "IA" }]);
  });

  it("chave ausente devolve o vazio, não quebra", () => {
    expect(readTopics()).toEqual([]);
    expect(readIdeas()).toEqual([]);
    expect(readLens()).toBeNull();
  });

  it("JSON inválido é descartado em vez de estourar", () => {
    localStorage.setItem("stalo:topics", "{isso não é json");
    expect(readTopics()).toEqual([]);
  });

  it("forma errada é descartada — o dado do devtools não chega à UI", () => {
    localStorage.setItem("stalo:topics", JSON.stringify({ v: 1, data: "haha" }));
    expect(readTopics()).toEqual([]);
    localStorage.setItem("stalo:topics", JSON.stringify({ v: 1, data: [{ id: 1, name: null }] }));
    expect(readTopics()).toEqual([]);
  });

  it("versão antiga é descartada, não migrada", () => {
    localStorage.setItem("stalo:topics", JSON.stringify({ v: 0, data: [{ id: "1", name: "IA" }] }));
    expect(readTopics()).toEqual([]);
  });

  it("lente só aceita os três valores conhecidos", () => {
    writeLens("investor");
    expect(readLens()).toBe("investor");
    localStorage.setItem("stalo:settings", JSON.stringify({ v: 1, data: { lens: "hacker" } }));
    expect(readLens()).toBeNull();
  });

  it("ideias corrompidas no meio da lista não derrubam as boas", () => {
    // uma entrada inválida não pode custar todas as ideias salvas do usuário
    const boa = {
      id: "a", insightRef: "i1", type: "oportunidade", title: "T", description: "D",
      rationale: "R", whyNow: "W", soWhat: "S", notes: "", savedAt: "2026-08-12",
      relatedItems: [], deepDive: null, financials: null,
    };
    localStorage.setItem("stalo:ideas", JSON.stringify({ v: 1, data: [boa, { id: 2 }] }));
    const lidas = readIdeas();
    expect(lidas).toHaveLength(1);
    expect(lidas[0].id).toBe("a");
  });

  it("hasAnything diz se o visitante já configurou algo", () => {
    expect(hasAnything()).toBe(false);
    writeTopics([{ id: "1", name: "IA" }]);
    expect(hasAnything()).toBe(true);
  });

  it("escrever não estoura quando o localStorage recusa (cota cheia / modo privado)", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error("QuotaExceededError"); };
    try {
      expect(() => writeIdeas([])).not.toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
```

- [ ] **Step 2: Rode e confirme que falha**

```bash
npx vitest run apps/web/src/lib/storage.test.ts
```

Esperado: falha na importação — `./storage` não existe.

Se o ambiente do vitest não tiver `localStorage`, o `vitest.config.ts` precisa de `environment: "jsdom"` para os testes de `apps/web`. Confira o arquivo antes de assumir que o teste está errado; se precisar adicionar, adicione (e o `jsdom` como devDependency).

- [ ] **Step 3: Implemente**

Crie `apps/web/src/lib/storage.ts`. O desenho: um par genérico `read`/`write` com um validador por chave, e as funções públicas por cima. Cada validador devolve o valor limpo ou `null`.

```ts
import type { Lens, NewsItem, SavedIdea, ScanResult, Topic } from "@stalo/shared";

// Única parte do app que toca localStorage. Os dados do visitante vivem aqui
// desde 2026-08 — não há banco, não há conta, não há sincronização entre
// aparelhos (ver artefatos/specs/2026-08-11-sem-banco-design.md).
//
// REGRA: o conteúdo do localStorage é ENTRADA NÃO CONFIÁVEL. Qualquer pessoa
// edita pelo devtools, e daqui esse conteúdo vai para a UI e para dentro de
// prompts. Tudo que sai é validado; o que não bater é descartado.

const VERSION = 1;

const KEYS = {
  topics: "stalo:topics",
  scan: "stalo:scan",
  ideas: "stalo:ideas",
  settings: "stalo:settings",
} as const;

function read<T>(key: string, validate: (raw: unknown) => T | null): T | null {
  if (typeof window === "undefined") return null; // servidor: não existe
  let parsed: unknown;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    parsed = JSON.parse(raw);
  } catch {
    return null; // JSON quebrado: trata como ausente
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const box = parsed as { v?: unknown; data?: unknown };
  if (box.v !== VERSION) return null; // versão antiga: descarta, não migra
  return validate(box.data);
}

function write(key: string, data: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify({ v: VERSION, data }));
  } catch {
    // cota cheia ou modo privado: seguir sem persistir é melhor que derrubar a
    // tela. O usuário perde a persistência, não a sessão.
  }
}

function isStr(v: unknown): v is string {
  return typeof v === "string";
}

// ---------- temas ----------

function validTopics(raw: unknown): Topic[] | null {
  if (!Array.isArray(raw)) return null;
  const ok = raw.filter((t): t is Topic => {
    const c = t as Topic;
    return !!c && isStr(c.id) && isStr(c.name);
  });
  return ok;
}

export function readTopics(): Topic[] {
  return read(KEYS.topics, validTopics) ?? [];
}

export function writeTopics(topics: Topic[]): void {
  write(KEYS.topics, topics);
}
```

Siga o mesmo formato para as demais chaves:

- `validScan`: o guardado é `{ result: ScanResult; createdAt: string }`. Valide que `result.items` e `result.insights` são arrays e descarte os elementos sem `id` string. `readScan()` devolve `{ result: null, createdAt: null }` quando não há nada ou o dado não valida. **`writeScan(result)` gera o `createdAt` ele mesmo**, com `new Date().toISOString()` — quem chama passa só o resultado, e o carimbo de tempo é responsabilidade de quem guarda (era o `DEFAULT now()` da tabela `scans`). Importe `ScanResult` e `Insight` de `@stalo/shared`.
- `validIdeas`: array; **filtra elemento a elemento** — uma ideia corrompida não pode custar as outras (há teste para isso). Um elemento vale quando `id`, `title`, `type` e `description` são strings; normalize `deepDive`/`financials` ausentes para `null` e `relatedItems` ausente para `[]`.
- `validLens`: aceita apenas `"founder" | "investor" | "explorer"`; qualquer outra coisa vira `null`.
- `hasAnything()`: `readTopics().length > 0 || readLens() !== null`. Mesma pergunta que o `page.tsx` fazia ao banco.

- [ ] **Step 4: Rode e confirme que passa**

```bash
npx vitest run apps/web/src/lib/storage.test.ts
```

Esperado: 9 testes passando.

- [ ] **Step 5: Rode a suíte inteira e commite**

```bash
npm run typecheck && npx vitest run
git status --short   # precisa estar vazio DEPOIS do commit; confira antes de rodar a suíte final
git add apps/web/src/lib/storage.ts apps/web/src/lib/storage.test.ts
git commit -m "feat(storage): cofre local tipado e validado para os dados do visitante"
```

---

### Task 2: Temas e preferências saem do servidor

**Files:**
- Modify: `apps/web/src/lib/api.ts` (funções de topics e settings)
- Delete: `apps/web/src/app/api/topics/route.ts`, `apps/web/src/app/api/topics/[id]/route.ts`, `apps/web/src/app/api/settings/route.ts`

**Interfaces:**
- Consumes: `readTopics`/`writeTopics`/`readLens`/`writeLens` da Task 1.
- Produces: as mesmas 5 funções de sempre, com as **mesmas assinaturas** — `fetchTopics(): Promise<Topic[]>`, `createTopic(name: string): Promise<Topic>`, `deleteTopic(id: string): Promise<void>`, `fetchSettings(): Promise<{ lens: Lens | null }>`, `saveLens(lens: Lens): Promise<void>`. Continuam `async` mesmo sem I/O, para nenhum componente mudar.

**Contexto:** o limite de 5 temas e a recusa a duplicados moram hoje no servidor (`apps/web/src/app/api/topics/route.ts`, usando `MAX_TOPICS` de `@stalo/server`). Eles vêm junto para o cliente — a regra continua existindo, só muda de lugar. `MAX_TOPICS` continua exportado por `@stalo/server`; importe de lá em vez de repetir o número.

- [ ] **Step 1: Escreva os testes que falham**

Acrescente a `apps/web/src/lib/api.test.ts` (o arquivo já existe) um bloco novo:

```ts
describe("temas no armazenamento local", () => {
  beforeEach(() => localStorage.clear());

  it("cria tema com id próprio e persiste", async () => {
    const t = await createTopic("IA");
    expect(t.name).toBe("IA");
    expect(t.id).toBeTruthy();
    expect(await fetchTopics()).toEqual([t]);
  });

  it("recusa o 6º tema com mensagem visível", async () => {
    for (const n of ["a", "b", "c", "d", "e"]) await createTopic(n);
    await expect(createTopic("f")).rejects.toThrow(/5 temas/);
  });

  it("recusa duplicado ignorando maiúsculas", async () => {
    await createTopic("Fintech");
    await expect(createTopic("fintech")).rejects.toThrow(/já/i);
  });

  it("remove tema por id", async () => {
    const t = await createTopic("IA");
    await deleteTopic(t.id);
    expect(await fetchTopics()).toEqual([]);
  });

  it("a lente vai e volta", async () => {
    expect(await fetchSettings()).toEqual({ lens: null });
    await saveLens("founder");
    expect(await fetchSettings()).toEqual({ lens: "founder" });
  });
});
```

- [ ] **Step 2: Rode e confirme que falha**

```bash
npx vitest run apps/web/src/lib/api.test.ts
```

Esperado: falha — as funções ainda fazem `fetch` e não há servidor no teste.

- [ ] **Step 3: Implemente**

Em `apps/web/src/lib/api.ts`, substitua o corpo das cinco funções. Mantenha o `parseError` e o resto do arquivo intactos.

```ts
import { MAX_TOPICS } from "@stalo/server";
import { readLens, readTopics, writeLens, writeTopics } from "./storage";

export async function fetchTopics(): Promise<Topic[]> {
  return readTopics();
}

export async function createTopic(name: string): Promise<Topic> {
  const limpo = name.trim();
  if (!limpo) throw new Error("Dê um nome ao tema.");

  const atuais = readTopics();
  if (atuais.length >= MAX_TOPICS) {
    throw new Error(`Máximo de ${MAX_TOPICS} temas por vez.`);
  }
  if (atuais.some((t) => t.name.toLowerCase() === limpo.toLowerCase())) {
    throw new Error("Esse tema já está na lista.");
  }

  const novo: Topic = { id: crypto.randomUUID(), name: limpo };
  writeTopics([...atuais, novo]);
  return novo;
}

export async function deleteTopic(id: string): Promise<void> {
  writeTopics(readTopics().filter((t) => t.id !== id));
}

export async function fetchSettings(): Promise<{ lens: Lens | null }> {
  return { lens: readLens() };
}

export async function saveLens(lens: Lens): Promise<void> {
  writeLens(lens);
}
```

**Atenção ao importar `MAX_TOPICS`:** `@stalo/server` tem módulos com `import "server-only"`. Se importar a constante puxar a árvore do servidor para o bundle do cliente, o build quebra — nesse caso, mova `MAX_TOPICS` para `@stalo/shared` (é uma regra de domínio, não de servidor) e ajuste os dois lados. Verifique com `npm run build` antes de considerar o passo pronto.

- [ ] **Step 4: Apague as rotas**

```bash
git rm apps/web/src/app/api/topics/route.ts "apps/web/src/app/api/topics/[id]/route.ts" apps/web/src/app/api/settings/route.ts
```

- [ ] **Step 5: Verifique e commite**

```bash
npm run typecheck && npx vitest run && npm run build
```

O `npm run build` importa aqui: é ele que pega import de código de servidor vazando para o cliente.

```bash
git commit -m "feat(temas)!: temas e lente passam a viver no navegador"
```

---

### Task 3: Scan para de persistir

**Files:**
- Modify: `apps/web/src/lib/api.ts` (`requestScan`, `fetchLatestScan`)
- Modify: `apps/web/src/app/api/scan/route.ts`
- Modify: `apps/web/src/app/api/scan/route.test.ts`
- Delete: `apps/web/src/app/api/scan/latest/route.ts`

**Interfaces:**
- Produces: `requestScan(topics, days)` e `fetchLatestScan()` com as mesmas assinaturas de hoje. `requestScan` passa a **gravar o resultado localmente** antes de devolvê-lo.

- [ ] **Step 1: Ajuste a rota de scan**

Em `apps/web/src/app/api/scan/route.ts`, remova a persistência: saem o `getWorkspaceId()`, o `saveScan(...)` e o import dos dois. O `try` fica só com `runScan` e o retorno. O comentário do topo do arquivo, que hoje fala em persistir, precisa refletir o que a rota faz agora.

Mantenha intactos: a validação de `topics`/`days`, a janela `ALLOWED_DAYS`, o rate limit com `failClosed: true` antes da chamada de IA, e o tratamento de erro com detalhe só fora de produção.

- [ ] **Step 2: Ajuste o teste da rota**

Em `apps/web/src/app/api/scan/route.test.ts`: o mock de `@stalo/server` perde `saveScan`, o mock de `@/lib/workspace` sai inteiro, e a asserção `expect(mockSaveScan).toHaveBeenCalledWith(...)` do caso feliz vira uma asserção de que a resposta traz o resultado do `runScan`. Os casos de 429 e 503 continuam como estão, incluindo `expect(mockRunScan).not.toHaveBeenCalled()`.

- [ ] **Step 3: Ligue o cliente ao armazenamento**

Em `api.ts`:

```ts
export async function requestScan(topics: string[], days: number | null): Promise<ScanResult> {
  const res = await fetch("/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topics, days }),
  });
  if (!res.ok) throw new Error(await parseError(res, "Falha ao buscar notícias."));
  const result = (await res.json()) as ScanResult;
  writeScan(result); // quem guarda agora é o navegador
  return result;
}

export async function fetchLatestScan(): Promise<{ result: ScanResult | null; createdAt: string | null }> {
  return readScan();
}
```

- [ ] **Step 4: Apague a rota do último scan**

```bash
git rm "apps/web/src/app/api/scan/latest/route.ts"
```

- [ ] **Step 5: Verifique e commite**

```bash
npm run typecheck && npx vitest run && npm run build
git commit -m "feat(scan)!: resultado do scan é guardado pelo navegador"
```

---

### Task 4: Ideias salvas saem do servidor

**Files:**
- Modify: `apps/web/src/lib/api.ts` (`fetchIdeas`, `createIdea`, `deleteIdea`)
- Delete: `apps/web/src/app/api/ideas/route.ts`, `apps/web/src/app/api/ideas/[id]/route.ts`

**Interfaces:**
- Produces: as três funções com as assinaturas de hoje. `createIdea(payload: NewIdeaPayload): Promise<SavedIdea>` continua devolvendo a ideia completa, agora montada no cliente: `id` via `crypto.randomUUID()`, `savedAt` via `new Date().toISOString()`, `deepDive` e `financials` em `null`.

- [ ] **Step 1: Escreva os testes que falham**

Em `apps/web/src/lib/api.test.ts`, um bloco novo cobrindo: salvar devolve a ideia com `id` e `savedAt` preenchidos e `deepDive`/`financials` nulos; listar devolve o que foi salvo; remover por id tira só aquela; e a lista sai **da mais recente para a mais antiga** (é a ordem que `listIdeas` fazia no SQL com `ORDER BY saved_at DESC`, e a `IdeasPanel` conta com ela).

- [ ] **Step 2: Rode e confirme que falha.** `npx vitest run apps/web/src/lib/api.test.ts`

- [ ] **Step 3: Implemente**

```ts
export async function fetchIdeas(): Promise<SavedIdea[]> {
  return readIdeas();
}

export async function createIdea(payload: NewIdeaPayload): Promise<SavedIdea> {
  const nova: SavedIdea = {
    ...payload,
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
    deepDive: null,
    financials: null,
  };
  writeIdeas([nova, ...readIdeas()]); // mais recente primeiro
  return nova;
}

export async function deleteIdea(id: string): Promise<void> {
  writeIdeas(readIdeas().filter((i) => i.id !== id));
}
```

- [ ] **Step 4: Apague as rotas e verifique**

```bash
git rm apps/web/src/app/api/ideas/route.ts "apps/web/src/app/api/ideas/[id]/route.ts"
npm run typecheck && npx vitest run && npm run build
git commit -m "feat(ideias)!: ideias salvas passam a viver no navegador"
```

---

### Task 5: Rotas de IA sem estado, com teto de entrada

**Files:**
- Create: `apps/web/src/lib/aiPayload.ts`
- Create: `apps/web/src/lib/aiPayload.test.ts`
- Create: `apps/web/src/app/api/dive/route.ts`
- Create: `apps/web/src/app/api/dive/route.test.ts`
- Create: `apps/web/src/app/api/financials/route.ts`
- Modify: `apps/web/src/lib/api.ts` (`requestDeepDive`, `requestFinancials`)
- Delete: `apps/web/src/app/api/ideas/[id]/dive/**`, `apps/web/src/app/api/ideas/[id]/financials/**`

**Interfaces:**
- Consumes: `runDeepDive(idea, lens)` e `runFinancials(...)` de `@stalo/server` — as mesmas de hoje, que já recebem a ideia como objeto (confira a assinatura de `runFinancials` antes de escrever a rota).
- Produces:
  - `POST /api/dive` — corpo `{ idea: SavedIdea; lens: Lens | null }`, resposta `DeepDive`.
  - `POST /api/financials` — corpo `{ idea: SavedIdea; lens: Lens | null }`, resposta `Financials`.
  - `validateIdeaPayload(body: unknown): { idea: SavedIdea; lens: Lens | null } | { error: string }` em `aiPayload.ts`.
  - `requestDeepDive(idea: SavedIdea): Promise<SavedIdea>` e `requestFinancials(idea: SavedIdea): Promise<SavedIdea>` — **mudam de assinatura**: recebem a ideia inteira em vez do id, porque o servidor não tem mais como buscá-la. Os chamadores em `DeepDiveView.tsx` e `IdeasPanel.tsx` passam a mandar o objeto; ajuste-os.

**Contexto — o risco que esta tarefa cria.** Até aqui, o conteúdo que ia para o prompt vinha do banco, escrito pelo próprio servidor. Agora vem do cliente, no corpo da requisição. Isso abre um caminho para queimar tokens mandando uma ideia gigante. Por isso o `aiPayload.ts`: **valide forma e imponha teto de tamanho antes de montar o prompt**, e recuse com 400 — que não consome cota de rate limit nem chama a OpenAI.

Tetos: o corpo inteiro no máximo **32 KB**; `title` 200 caracteres; `description`, `rationale`, `whyNow`, `soWhat` e `notes` 2000 cada; `relatedItems` no máximo 20 itens, cada um com `title` e `url` de até 500. Campos acima do teto são **recusados**, não truncados — truncar em silêncio manda para a IA algo diferente do que o usuário vê.

- [ ] **Step 1: Escreva os testes do validador**

`apps/web/src/lib/aiPayload.test.ts`, cobrindo: corpo válido passa e devolve a ideia; corpo sem `idea` é recusado; `lens` desconhecida vira `null` em vez de recusar (a lente é preferência, não conteúdo); `title` acima de 200 recusa com mensagem em português; `relatedItems` com 21 itens recusa; e um corpo acima de 32 KB recusa. Cada caso deve afirmar a mensagem visível, não só que houve erro.

- [ ] **Step 2: Rode e confirme que falha.** `npx vitest run apps/web/src/lib/aiPayload.test.ts`

- [ ] **Step 3: Implemente o validador**, com os tetos acima em constantes nomeadas no topo do arquivo.

- [ ] **Step 4: Escreva a rota `/api/dive` e o seu teste**

A rota, na ordem: lê o corpo (400 se não for JSON) → `validateIdeaPayload` (400 com a mensagem do validador) → rate limit `DIVE_LIMIT` com `failClosed: true` → `runDeepDive(idea, lens)` → devolve o `DeepDive`. Sem `getWorkspaceId`, sem `getIdea`, sem `saveDeepDive`.

O cache que hoje mora no servidor (`if (idea.deepDive?.typeAnalysis) return`) **sai daqui e vai para o `api.ts`**: o cliente já tem a ideia, então nem precisa fazer a requisição. Isso preserva o comportamento de hoje, em que cache não consome cota.

O teste da rota espelha `apps/web/src/app/api/scan/route.test.ts` e cobre três casos: corpo inválido → 400 sem chamar `runDeepDive`; contador fora → 503 sem chamar `runDeepDive`; caminho feliz → 200 com o mergulho no corpo.

- [ ] **Step 5: Escreva `/api/financials`**

Mesma forma da `/api/dive`, com `FINANCIALS_LIMIT` e `runFinancials(idea, lens)` — cuja assinatura é `runFinancials(idea: SavedIdea, lens?: Lens | null): Promise<Financials>`.

Uma diferença que **precisa** ser preservada: a rota de hoje exige que a ideia já tenha sido mergulhada e responde **409** com a mensagem exata `"Mergulhe na ideia antes de aprofundar no financeiro."` quando `idea.deepDive` é nulo. Mantenha essa checagem na rota, depois da validação de payload e antes do rate limit — o servidor não pode confiar que o cliente checou.

- [ ] **Step 6: Ligue o cliente**

```ts
export async function requestDeepDive(idea: SavedIdea): Promise<SavedIdea> {
  // cache: o mergulho novo (com análise por tipo) já basta — não re-gasta a IA
  if (idea.deepDive?.typeAnalysis) return idea;

  const res = await fetch("/api/dive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idea, lens: readLens() }),
  });
  if (!res.ok) throw new Error(await parseError(res, "Falha ao aprofundar a ideia."));
  const deepDive = (await res.json()) as DeepDive;

  const atualizada = { ...idea, deepDive };
  writeIdeas(readIdeas().map((i) => (i.id === idea.id ? atualizada : i)));
  return atualizada;
}
```

`requestFinancials(idea)` segue o mesmo formato, gravando em `financials`, e **tem sim uma checagem de cache**: `if (idea.financials) return idea` — hoje ela mora na rota (`if (idea.financials) return NextResponse.json(idea)`) e vem para cá pelo mesmo motivo do mergulho, para o cache não gastar requisição nem cota. A precondição do mergulho também ganha um atalho no cliente: se `idea.deepDive` for nulo, lance `new Error("Mergulhe na ideia antes de aprofundar no financeiro.")` em vez de fazer a requisição que voltaria 409.

- [ ] **Step 7: Apague as rotas antigas, ajuste os chamadores, verifique e commite**

```bash
git rm -r "apps/web/src/app/api/ideas"
grep -rn "requestDeepDive\|requestFinancials" apps/web/src --include="*.tsx"   # ajuste os chamadores
npm run typecheck && npx vitest run && npm run build
git commit -m "feat(ia)!: mergulho e financeiro recebem a ideia no corpo, com teto de entrada"
```

---

### Task 6: O cookie e o proxy saem

**Files:**
- Delete: `apps/web/src/proxy.ts`, `apps/web/src/lib/workspace.ts`, `apps/web/src/lib/workspaceCookie.ts`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/radar/page.tsx`

**Contexto:** com os dados no navegador, o cookie `stalo_wid` não isola mais nada, e o `proxy.ts` existia só para criá-lo. O `page.tsx` de hoje pergunta ao banco, no servidor, se o visitante já configurou algo, para decidir entre onboarding e radar — pergunta que o servidor não pode mais responder.

**Decisão:** o CTA da landing aponta sempre para `/radar`, e o `/radar` (que já é `"use client"`) redireciona para `/onboarding` quando `hasAnything()` é falso. Assim o servidor renderiza um href estável, sem risco de divergência de hidratação, e a decisão acontece onde o dado está.

- [ ] **Step 1:** Em `page.tsx`, remova a consulta ao banco e o `getWorkspaceId`; o componente vira síncrono e renderiza `<Landing dest="/radar" />`. Se `dest` deixar de ter propósito, simplifique a prop no `Landing.tsx` — mas não reescreva a landing além disso.

- [ ] **Step 2:** Em `radar/page.tsx`, no efeito que hoje carrega os dados, redirecione para `/onboarding` (com `router.replace`) quando `hasAnything()` for falso, antes de qualquer outra coisa.

- [ ] **Step 3:** Apague os três arquivos e confirme que ninguém os importa:

```bash
git rm apps/web/src/proxy.ts apps/web/src/lib/workspace.ts apps/web/src/lib/workspaceCookie.ts
grep -rn "workspace\|stalo_wid\|proxy" apps/web/src --include="*.ts" --include="*.tsx" | grep -v node_modules
```

Esperado: nenhuma referência viva. As rotas da newsletter podem citar workspace em comentário — comentário desatualizado é achado, corrija.

- [ ] **Step 4: Verifique e commite**

```bash
npm run typecheck && npx vitest run && npm run build
git commit -m "refactor(workspace)!: cookie e proxy saem — o dado mora no navegador"
```

---

### Task 7: Poda do servidor e documentação

**Files:**
- Modify: `packages/server/src/repo.ts`, `packages/server/src/index.ts`
- Modify: `packages/server/db/schema.sql`
- Modify: `artefatos/arquiteturad.md`, `README.md`, `apps/web/.env.example`

**Contexto:** o `repo.ts` fica com funções que ninguém mais chama. **Cuidado:** a newsletter ainda usa o banco até o plano 3 — `ensureEdition`, `getEdition`, `saveCombo` (por `newsletter.ts`) e `saveSubscriber`, `getActiveSubscribers`, `unsubscribe` (pelas rotas). Essas ficam.

- [ ] **Step 1:** Remova de `repo.ts` as funções de dados do visitante, hoje sem chamador: `listTopics`, `addTopic`, `removeTopic`, `countTopics`, `saveScan`, `getLatestScan`, `listIdeas`, `getIdea`, `saveIdea`, `removeIdea`, `saveDeepDive`, `saveFinancials`, `getLens`, `setLens`. Ajuste `index.ts`. Prove que nada ficou órfão:

```bash
for f in listTopics addTopic removeTopic countTopics saveScan getLatestScan listIdeas getIdea saveIdea removeIdea saveDeepDive saveFinancials getLens setLens; do
  echo "== $f"; grep -rn "\b$f\b" apps packages --include="*.ts" --include="*.tsx" | grep -v node_modules
done
```

Esperado: nenhuma saída além das próprias definições, que você está removendo. `MAX_TOPICS` **fica** (o cliente usa).

- [ ] **Step 2:** Remova do `schema.sql` as tabelas `topics`, `scans`, `news_items`, `insights`, `saved_ideas` e `workspace_settings`, com seus índices e os `ALTER TABLE` de `workspace_id`. Ficam `subscribers` e `newsletter_editions`.

- [ ] **Step 3:** Atualize `artefatos/arquiteturad.md`: a seção 4 (schema) reflete só o que sobrou, e o log de decisões ganha uma entrada explicando que os dados do visitante foram para o `localStorage`, com o trade-off assumido — sem sincronização entre aparelhos e **sem backup: limpar os dados do navegador apaga as ideias salvas**, coisa que o Postgres cobria. Registre também que exportar as ideias em JSON ficou como follow-up.

- [ ] **Step 4:** Atualize o `README.md` (a seção "Como rodar" e a de stack) e o `.env.example`: o `DATABASE_URL` passa a ser exigido **apenas** pela newsletter.

- [ ] **Step 5: Verificação final e commit**

```bash
npm run typecheck && npx vitest run && npm run build
git status --short   # vazio antes da suíte final
git commit -m "chore(banco): remove o acesso a dados do visitante e atualiza a documentação"
```

---

## Depois deste plano

O site volta ao ar sem depender do Supabase para o produto. O que ainda toca o banco é só a newsletter, que o **plano 3** remove junto com o e-mail, ao transformar o boletim na página `/boletim`.

**Verificação manual antes do deploy** (nenhum teste automatizado cobre isto): abrir o app, criar temas, rodar um scan, salvar uma ideia, mergulhar, recarregar a página e confirmar que tudo continua lá; depois abrir uma aba anônima e confirmar que ela começa vazia.

**Follow-up conhecido e não resolvido aqui:** as ideias salvas passam a não ter backup nenhum. Limpar os dados do navegador apaga tudo, e antes o Postgres era a cópia. Um botão de exportar/importar JSON resolve e deve entrar assim que este plano estabilizar.
