# Rate limit no Upstash (fail-closed) — Plano de Implementação

> **Para quem for implementar:** os passos usam checkbox (`- [ ]`) para acompanhamento. Faça um commit por tarefa, e rode a suíte antes de cada commit.

**Goal:** Tirar o contador de rate limit do Postgres e colocá-lo no Upstash Redis, mudando a política das rotas de IA de fail-open para fail-closed.

**Architecture:** `checkRateLimit` deixa de fazer upsert no Postgres e passa a usar `INCR` + `EXPIRE` no Redis, mantendo a **mesma semântica de janela fixa** e os mesmos limites. O acesso ao Redis fica atrás de uma interface pequena (`RateLimitStore`) para os testes rodarem sem rede. Na camada web, o `catch` que hoje deixa passar quando a infra falha passa a recusar nas rotas caras.

**Tech Stack:** TypeScript, `@upstash/redis` (cliente REST, funciona em serverless), Vitest.

Este é o **plano 1 de 3** da spec `artefatos/specs/2026-08-11-sem-banco-design.md`. Ele vem antes da migração para `localStorage` (que a spec lista primeiro) por um motivo operacional: hoje o freio de custo depende do Postgres, o Postgres está fora, e o resultado é que cada tentativa de scan em produção chama a OpenAI sem limite e falha depois — gastando sem entregar. Este plano para isso e não depende de nenhum outro.

Ao final dele, o rate limit é a única coisa que já não precisa do banco. As rotas de dados continuam quebradas até o plano 2.

## Global Constraints

- Textos de UI e mensagens de erro em **português**, tom direto (CLAUDE.md).
- Commits em **conventional commits, em pt-BR** (CLAUDE.md).
- A chave de IA e qualquer credencial **nunca** chegam ao client (CLAUDE.md, regra 1).
- Erro nunca falha em silêncio: sempre há mensagem visível ao usuário (CLAUDE.md).
- Mudança de schema acompanha atualização em `artefatos/arquiteturad.md` (CLAUDE.md, regra 3).
- Limites preservados: scan **4 / 2h**; dive **20 / 1h**; financials **20 / 1h**.
- Janela **fixa** (não deslizante) — a troca é de armazenamento, não de política.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `packages/server/src/rateLimit.ts` (modificar) | contador de janela fixa sobre uma `RateLimitStore`; sem conhecer Redis nem Postgres diretamente |
| `packages/server/src/redis.ts` (criar) | única coisa que sabe que o store é Upstash; cria o cliente preguiçosamente, como `db.ts` faz hoje |
| `packages/server/src/rateLimit.test.ts` (criar) | testes do contador contra um store falso, sem rede |
| `apps/web/src/lib/rateLimit.ts` (modificar) | política HTTP: quem falha fechado, quem falha aberto, e as mensagens |
| `apps/web/src/lib/rateLimit.test.ts` (criar) | testes da política |
| `apps/web/.env.example` (modificar) | passa a listar as envs do Upstash |

---

### Task 1: Contador sobre uma store abstrata

**Files:**
- Modify: `packages/server/src/rateLimit.ts` (substitui a implementação inteira, 1-60)
- Create: `packages/server/src/rateLimit.test.ts`

**Interfaces:**
- Consumes: nada de tarefas anteriores.
- Produces:
  - `interface RateLimitStore { incr(key: string): Promise<number>; expire(key: string, seconds: number): Promise<unknown>; ttl(key: string): Promise<number> }`
  - `interface RateLimitResult { allowed: boolean; remaining: number; retryAfterSeconds: number }`
  - `checkRateLimit(key: string, limit: number, windowSeconds: number, store?: RateLimitStore): Promise<RateLimitResult>` — o 4º parâmetro é opcional e existe para teste; em produção cai no store padrão da Task 2.

- [ ] **Step 1: Escreva o teste que falha**

Crie `packages/server/src/rateLimit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { checkRateLimit, type RateLimitStore } from "./rateLimit";

// store falso em memória: mesma semântica do Redis para INCR/EXPIRE/TTL,
// sem rede. `calls` registra as chamadas para verificar que o EXPIRE só
// acontece na primeira requisição da janela.
function fakeStore(): RateLimitStore & { calls: string[] } {
  const counts = new Map<string, number>();
  const ttls = new Map<string, number>();
  const calls: string[] = [];
  return {
    calls,
    async incr(key) {
      calls.push(`incr:${key}`);
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return n;
    },
    async expire(key, seconds) {
      calls.push(`expire:${key}:${seconds}`);
      ttls.set(key, seconds);
      return 1;
    },
    async ttl(key) {
      calls.push(`ttl:${key}`);
      return ttls.get(key) ?? -1;
    },
  };
}

describe("checkRateLimit", () => {
  it("permite a primeira requisição e desconta do saldo", async () => {
    const store = fakeStore();
    const r = await checkRateLimit("scan:1.1.1.1", 4, 7200, store);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(3);
  });

  it("define o TTL só na primeira requisição da janela", async () => {
    const store = fakeStore();
    await checkRateLimit("scan:1.1.1.1", 4, 7200, store);
    await checkRateLimit("scan:1.1.1.1", 4, 7200, store);
    const expires = store.calls.filter((c) => c.startsWith("expire:"));
    expect(expires).toEqual(["expire:scan:1.1.1.1:7200"]);
  });

  it("bloqueia ao passar do limite e informa quanto falta da janela", async () => {
    const store = fakeStore();
    for (let i = 0; i < 4; i++) await checkRateLimit("scan:1.1.1.1", 4, 7200, store);
    const r = await checkRateLimit("scan:1.1.1.1", 4, 7200, store);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
    expect(r.retryAfterSeconds).toBe(7200);
  });

  it("isola chaves diferentes", async () => {
    const store = fakeStore();
    for (let i = 0; i < 4; i++) await checkRateLimit("scan:1.1.1.1", 4, 7200, store);
    const outro = await checkRateLimit("scan:2.2.2.2", 4, 7200, store);
    expect(outro.allowed).toBe(true);
  });

  it("usa a janela cheia quando o TTL veio ausente", async () => {
    // TTL -1 = chave sem expiração registrada. Nunca deve virar Retry-After
    // negativo, que o navegador interpretaria como 'pode tentar já'.
    const store = fakeStore();
    const semTtl: RateLimitStore = { ...store, async ttl() { return -1; } };
    for (let i = 0; i < 5; i++) await checkRateLimit("scan:1.1.1.1", 4, 7200, semTtl);
    const r = await checkRateLimit("scan:1.1.1.1", 4, 7200, semTtl);
    expect(r.retryAfterSeconds).toBe(7200);
  });

  it("propaga o erro do store em vez de engolir", async () => {
    // quem decide o que fazer quando a infra cai é a camada HTTP (Task 3),
    // não o contador.
    const store: RateLimitStore = {
      async incr() { throw new Error("upstash fora"); },
      async expire() { return 1; },
      async ttl() { return -1; },
    };
    await expect(checkRateLimit("scan:1.1.1.1", 4, 7200, store)).rejects.toThrow("upstash fora");
  });
});
```

- [ ] **Step 2: Rode e confirme que falha**

```bash
npx vitest run packages/server/src/rateLimit.test.ts
```

Esperado: falha na importação — `checkRateLimit` ainda tem a assinatura antiga e `RateLimitStore` não existe.

- [ ] **Step 3: Implemente**

Substitua **todo** o conteúdo de `packages/server/src/rateLimit.ts`:

```ts
import "server-only";
import { redisStore } from "./redis";

// Rate limiting por JANELA FIXA. O contador vive no Upstash (Redis) — precisa
// ser compartilhado entre as instâncias serverless do Vercel, que in-memory
// não garante. Antes ficava no Postgres; saiu junto com o banco.
//
// Uma chave por bucket+IP (ex.: "rl:scan:1.2.3.4"), com TTL igual à janela:
// quando o TTL vence, a chave some e a janela recomeça sozinha. INCR é atômico,
// então é seguro sob requisições concorrentes.

// O mínimo que o contador precisa de um Redis. Existir como interface é o que
// permite testar sem rede (ver rateLimit.test.ts).
export interface RateLimitStore {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  ttl(key: string): Promise<number>;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  store: RateLimitStore = redisStore(),
): Promise<RateLimitResult> {
  const count = await store.incr(key);

  // primeira requisição da janela: só aqui o TTL é definido. Renovar o TTL a
  // cada requisição transformaria a janela fixa em janela infinita para quem
  // continua batendo.
  if (count === 1) await store.expire(key, windowSeconds);

  if (count <= limit) {
    return { allowed: true, remaining: limit - count, retryAfterSeconds: 0 };
  }

  // TTL negativo = chave sem expiração conhecida; cai na janela cheia para o
  // Retry-After nunca sair negativo (o navegador leria como "tente agora").
  const ttl = await store.ttl(key);
  return {
    allowed: false,
    remaining: 0,
    retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
  };
}
```

- [ ] **Step 4: Rode e confirme que passa**

```bash
npx vitest run packages/server/src/rateLimit.test.ts
```

Esperado: 6 testes passando. O typecheck ainda falha porque `./redis` não existe — é a Task 2.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/rateLimit.ts packages/server/src/rateLimit.test.ts
git commit -m "refactor(limites): contador de janela fixa sobre store abstrata"
```

---

### Task 2: O store do Upstash

**Files:**
- Create: `packages/server/src/redis.ts`
- Modify: `packages/server/package.json` (dependência)
- Modify: `packages/server/src/index.ts` (exports)

**Interfaces:**
- Consumes: `RateLimitStore` da Task 1.
- Produces: `redisStore(): RateLimitStore` — resolve o cliente na primeira chamada, nunca no import.

- [ ] **Step 1: Instale a dependência**

```bash
npm install @upstash/redis --workspace @stalo/server
```

- [ ] **Step 2: Crie o módulo**

Crie `packages/server/src/redis.ts`:

```ts
import "server-only";
import { Redis } from "@upstash/redis";
import type { RateLimitStore } from "./rateLimit";

// Cliente do Upstash (Redis via REST — funciona em serverless, sem pool de
// conexão). SERVER-ONLY: o token nunca chega ao client.
//
// A criação é PREGUIÇOSA, não no import: assim `next build` não quebra quando
// as envs ainda não estão configuradas — o erro só aparece se uma rota de fato
// precisar do contador.

let client: Redis | undefined;

function getClient(): Redis {
  if (client) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL/TOKEN não configuradas. Defina no .env (dev) e no painel do Vercel (prod).",
    );
  }
  client = new Redis({ url, token });
  return client;
}

export function redisStore(): RateLimitStore {
  return {
    incr: (key) => getClient().incr(key),
    expire: (key, seconds) => getClient().expire(key, seconds),
    ttl: (key) => getClient().ttl(key),
  };
}
```

- [ ] **Step 3: Exporte pelo índice**

Em `packages/server/src/index.ts`, garanta que a linha que exporta o rate limit continua exportando o tipo novo. Se hoje for `export { checkRateLimit } from "./rateLimit";`, troque por:

```ts
export { checkRateLimit } from "./rateLimit";
export type { RateLimitResult, RateLimitStore } from "./rateLimit";
```

- [ ] **Step 4: Rode typecheck e a suíte**

```bash
npm run typecheck && npx vitest run
```

Esperado: typecheck limpo e a suíte inteira passando.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/redis.ts packages/server/src/index.ts packages/server/package.json package-lock.json
git commit -m "feat(limites): contador passa a viver no Upstash"
```

---

### Task 3: Política HTTP — fail-closed nas rotas de IA

**Files:**
- Modify: `apps/web/src/lib/rateLimit.ts` (substitui `enforceRateLimit` e `enforceScanLimit`)
- Create: `apps/web/src/lib/rateLimit.test.ts`
- Modify: `apps/web/src/app/api/scan/route.ts:39` (chamada do limite)
- Modify: `apps/web/src/app/api/scan/route.test.ts` (mock do limite)

**Interfaces:**
- Consumes: `checkRateLimit` da Task 1.
- Produces:
  - `enforceRateLimit(request: Request, bucket: string, limit: number, windowSeconds: number, opts?: { failClosed?: boolean }): Promise<NextResponse | null>` — devolve `null` para o handler seguir, ou a resposta de recusa.
  - `SCAN_LIMIT`, `DIVE_LIMIT`, `FINANCIALS_LIMIT` — constantes `{ bucket, limit, windowSeconds }`.
  - `enforceScanLimit` **deixa de existir**; `/api/scan` passa a chamar `enforceRateLimit` com `SCAN_LIMIT` e `failClosed: true`.

**Contexto para quem implementa:** hoje o `catch` devolve `null` quando o contador falha, ou seja, deixa passar. Numa rota que chama a OpenAI isso significa gastar dinheiro justamente quando a proteção está cega. Nas rotas caras a decisão passa a ser recusar (503). Em rotas baratas, continuar deixando passar é o certo — indisponibilidade do contador não deve derrubar o site inteiro.

A chave dupla IP+cookie do scan também sai: o cliente controla o próprio cookie e manda um UUID novo a cada requisição, então essa metade nunca segurou nada contra script. Fica só o IP, que é o que de fato segura.

- [ ] **Step 1: Escreva o teste que falha**

Crie `apps/web/src/lib/rateLimit.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const checkRateLimit = vi.fn();
vi.mock("@stalo/server", () => ({ checkRateLimit: (...a: unknown[]) => checkRateLimit(...a) }));

const { enforceRateLimit, SCAN_LIMIT } = await import("./rateLimit");

function req(ip = "1.2.3.4"): Request {
  return new Request("https://stalo.dev/api/scan", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
}

describe("enforceRateLimit", () => {
  beforeEach(() => checkRateLimit.mockReset());

  it("deixa passar quando está dentro do limite", async () => {
    checkRateLimit.mockResolvedValue({ allowed: true, remaining: 3, retryAfterSeconds: 0 });
    expect(await enforceRateLimit(req(), "scan", 4, 7200)).toBeNull();
  });

  it("recusa com 429 e Retry-After quando estoura", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 1800 });
    const res = await enforceRateLimit(req(), "scan", 4, 7200);
    expect(res?.status).toBe(429);
    expect(res?.headers.get("Retry-After")).toBe("1800");
  });

  it("usa o primeiro IP do x-forwarded-for na chave", async () => {
    checkRateLimit.mockResolvedValue({ allowed: true, remaining: 3, retryAfterSeconds: 0 });
    const r = new Request("https://stalo.dev/api/scan", {
      method: "POST",
      headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" },
    });
    await enforceRateLimit(r, "scan", 4, 7200);
    expect(checkRateLimit).toHaveBeenCalledWith("rl:scan:9.9.9.9", 4, 7200);
  });

  it("FAIL-CLOSED: recusa com 503 quando o contador cai e a rota é cara", async () => {
    checkRateLimit.mockRejectedValue(new Error("upstash fora"));
    const res = await enforceRateLimit(req(), "scan", 4, 7200, { failClosed: true });
    expect(res?.status).toBe(503);
    expect(await res?.json()).toEqual({
      error: "O controle de uso está indisponível agora. Tente de novo em alguns minutos.",
    });
  });

  it("FAIL-OPEN: deixa passar quando o contador cai e a rota é barata", async () => {
    checkRateLimit.mockRejectedValue(new Error("upstash fora"));
    expect(await enforceRateLimit(req(), "algo-barato", 20, 3600)).toBeNull();
  });

  it("usa a mensagem específica da rota quando ela é passada", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 900 });
    const res = await enforceRateLimit(req(), "scan", 4, 7200, {
      message: "Você usou seus 4 scans desta janela de 2 horas. Volte daqui a pouco.",
    });
    const body = (await res?.json()) as { error: string };
    expect(body.error).toContain("4 scans");
  });

  it("o limite do scan é 4 por 2 horas", () => {
    expect(SCAN_LIMIT).toEqual({ bucket: "scan", limit: 4, windowSeconds: 7200 });
  });
});
```

- [ ] **Step 2: Rode e confirme que falha**

```bash
npx vitest run apps/web/src/lib/rateLimit.test.ts
```

Esperado: falha — `SCAN_LIMIT` não existe e o `enforceRateLimit` atual não aceita `opts`.

- [ ] **Step 3: Implemente**

Substitua **todo** o conteúdo de `apps/web/src/lib/rateLimit.ts`:

```ts
import { NextResponse } from "next/server";
import { checkRateLimit } from "@stalo/server";

// Descobre o IP do cliente. No Vercel o IP real vem em x-forwarded-for (o
// primeiro da lista); localmente esses headers não existem, então cai em "local"
// (todos compartilham a mesma chave em dev — suficiente para testar o limite).
function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "local";
}

// Aplica o rate limit por IP a um endpoint. Devolve null para o handler seguir,
// ou a resposta de recusa. Chame ANTES da chamada cara à IA — assim a recusa
// não gasta a OpenAI.
//
// failClosed: o que fazer quando o PRÓPRIO contador falha (Upstash fora).
//   • true  → recusa (503). Use nas rotas que chamam a IA: sem contador não há
//     teto, e errar para o lado de não gastar é mais barato que o contrário.
//   • false → deixa passar. Use no resto: o contador fora não deve derrubar o
//     site inteiro.
//
// message: texto do 429. O padrão serve para qualquer rota; passe um específico
// quando a rota souber dizer algo mais útil ("seus 4 scans desta janela").
export async function enforceRateLimit(
  request: Request,
  bucket: string,
  limit: number,
  windowSeconds: number,
  opts: { failClosed?: boolean; message?: string } = {},
): Promise<NextResponse | null> {
  const key = `rl:${bucket}:${clientIp(request)}`;
  let result;
  try {
    result = await checkRateLimit(key, limit, windowSeconds);
  } catch (err) {
    console.error("rate limit check failed", err);
    if (!opts.failClosed) return null;
    return NextResponse.json(
      { error: "O controle de uso está indisponível agora. Tente de novo em alguns minutos." },
      { status: 503, headers: { "Retry-After": "60" } },
    );
  }

  if (result.allowed) return null;

  return NextResponse.json(
    {
      error:
        opts.message ??
        "Você atingiu o limite de uso por agora. Tente de novo em alguns minutos.",
    },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } },
  );
}

// Limites por endpoint, todos por IP. O scan é o mais caro (busca web na
// OpenAI), por isso a janela maior e o teto menor.
//
// Só o IP: a chave por cookie que existia antes não segurava nada contra script
// — quem abusa manda um cookie novo a cada requisição. Melhor um limite honesto
// do que dois que parecem dois.
const HOUR = 3600;
export const SCAN_LIMIT = { bucket: "scan", limit: 4, windowSeconds: 2 * HOUR };
export const DIVE_LIMIT = { bucket: "dive", limit: 20, windowSeconds: HOUR };
export const FINANCIALS_LIMIT = { bucket: "financials", limit: 20, windowSeconds: HOUR };
```

- [ ] **Step 4: Rode e confirme que passa**

```bash
npx vitest run apps/web/src/lib/rateLimit.test.ts
```

Esperado: 6 testes passando.

- [ ] **Step 5: Atualize a rota do scan**

Em `apps/web/src/app/api/scan/route.ts`, troque o import:

```ts
import { enforceRateLimit, SCAN_LIMIT } from "@/lib/rateLimit";
```

E substitua o bloco do limite (hoje nas linhas 37-40, que chama `getWorkspaceId` antes do limite):

```ts
  // rate limit ANTES de chamar a IA — o scan é o endpoint mais caro (busca
  // web). Uma recusa aqui não gasta a OpenAI. failClosed: sem contador de pé,
  // é mais barato recusar do que arriscar gasto sem teto.
  const limited = await enforceRateLimit(
    request,
    SCAN_LIMIT.bucket,
    SCAN_LIMIT.limit,
    SCAN_LIMIT.windowSeconds,
    {
      failClosed: true,
      message: "Você usou seus 4 scans desta janela de 2 horas. Volte daqui a pouco.",
    },
  );
  if (limited) return limited;

  const workspaceId = await getWorkspaceId();
```

Note que `getWorkspaceId()` **desce** para depois do limite: ele só é necessário para persistir, e não deve custar nada numa requisição que vai ser recusada.

- [ ] **Step 6: Marque dive e financials como fail-closed**

Em `apps/web/src/app/api/ideas/[id]/dive/route.ts` e `.../financials/route.ts`, acrescente o 5º argumento na chamada existente do `enforceRateLimit`:

```ts
      { failClosed: true },
```

- [ ] **Step 7: Ajuste o teste da rota de scan**

`apps/web/src/app/api/scan/route.test.ts` **não** mocka `@/lib/rateLimit` — ele mocka o `checkRateLimit` do `@stalo/server` e exercita a política de verdade. Por isso três dos quatro casos mudam. Mantenha os mocks e o `beforeEach` como estão e substitua o bloco `describe` inteiro (linhas 40-75) por:

```ts
describe("POST /api/scan — limite de 4 scans por 2h", () => {
  it("dentro do limite passa e consome a chave de IP", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    // uma única chave: a de IP. A chave por cookie saiu — o cliente a controla.
    expect(mockCheck.mock.calls).toEqual([["rl:scan:1.2.3.4", 4, 7200]]);
    expect(mockSaveScan).toHaveBeenCalledWith("wid-anon", ["IA"], { items: [], insights: [] });
  });

  it("limite estourado → 429 com Retry-After, sem gastar OpenAI", async () => {
    mockCheck.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 1800 });
    const res = await POST(req());
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("1800");
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("4 scans");
    expect(mockRunScan).not.toHaveBeenCalled();
  });

  it("contador fora → FAIL-CLOSED: 503 e a OpenAI não é chamada", async () => {
    // era fail-open. Com a infra do contador cega, deixar passar significava
    // gastar sem teto — foi o que aconteceu quando o Supabase caiu.
    mockCheck.mockRejectedValue(new Error("upstash fora"));
    const res = await POST(req());
    expect(res.status).toBe(503);
    expect(mockRunScan).not.toHaveBeenCalled();
    expect(mockSaveScan).not.toHaveBeenCalled();
  });
});
```

O caso "basta UMA das chaves estourar (cookie novo não renova)" é **apagado**: não existe mais chave dupla. O caso de fail-open vira o de fail-closed acima.

Confira também se algum teste restante ainda afirma `getWorkspaceId` sendo chamado antes do limite — no código novo ele desceu para depois, e uma requisição recusada não deve mais chamá-lo.

- [ ] **Step 8: Rode a suíte inteira e o typecheck**

```bash
npm run typecheck && npx vitest run
```

Esperado: typecheck limpo, tudo verde. Nenhuma referência restante a `enforceScanLimit`:

```bash
grep -rn "enforceScanLimit" apps packages --include="*.ts" | grep -v node_modules
```

Esperado: nenhuma saída.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/rateLimit.ts apps/web/src/lib/rateLimit.test.ts \
  apps/web/src/app/api/scan/route.ts apps/web/src/app/api/scan/route.test.ts \
  "apps/web/src/app/api/ideas/[id]/dive/route.ts" \
  "apps/web/src/app/api/ideas/[id]/financials/route.ts"
git commit -m "feat(limites)!: rotas de IA recusam quando o contador está fora

Antes o limite falhava aberta: com a infra do contador fora, a OpenAI era
chamada sem teto. Numa rota cara, o padrão certo é recusar. A chave por
cookie também sai — o cliente a controla, então nunca segurou script."
```

---

### Task 4: Configuração e documentação

**Files:**
- Modify: `apps/web/.env.example`
- Modify: `packages/server/db/schema.sql` (remove a tabela `rate_limits`)
- Modify: `artefatos/arquiteturad.md` (seção 4, schema)

**Interfaces:** nenhuma nova.

- [ ] **Step 1: Reescreva o `.env.example`**

Hoje ele lista 3 variáveis e o código usa 8. Substitua o conteúdo por:

```bash
# Nunca commite o .env real — apenas este template.

# --- IA ---
# Provider do MVP. Usada só em rotas /api/* (no server), nunca no client
# (ver CLAUDE.md, regra 1).
OPENAI_API_KEY=

# --- Contador de rate limit (Upstash Redis) ---
# Criadas automaticamente ao conectar o Upstash pela marketplace do Vercel.
# Sem elas, as rotas que chamam a IA recusam (fail-closed).
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# --- Banco (em remoção; ver artefatos/specs/2026-08-11-sem-banco-design.md) ---
DATABASE_URL=

# --- Boletim ---
# Segredo do cron da Vercel. Sem ele, a rota de geração recusa (fail-closed).
CRON_SECRET=
# Base dos links absolutos. Ex.: https://stalo.dev
APP_URL=

# --- E-mail (em remoção junto com a newsletter) ---
RESEND_API_KEY=
NEWSLETTER_FROM=
NEWSLETTER_ADMIN_SECRET=
```

- [ ] **Step 2: Remova a tabela `rate_limits` do schema**

Em `packages/server/db/schema.sql`, apague o bloco `CREATE TABLE IF NOT EXISTS rate_limits (...)` (a partir da linha 123) e qualquer índice dela. O contador não vive mais no Postgres.

- [ ] **Step 3: Atualize a arquitetura**

Em `artefatos/arquiteturad.md`, seção 4, remova o `CREATE TABLE rate_limits` (linha 155) e acrescente ao histórico de decisões:

```markdown
- **Rate limit fora do banco (2026-08-11)**: o contador saiu do Postgres para o Upstash (Redis). Motivo: o projeto free do Supabase ficou inacessível e derrubou o contador junto com os dados — e, como o limite falhava ABERTA, cada tentativa de scan chamava a OpenAI sem teto e falhava depois, gastando sem entregar. Além do armazenamento, mudou a política: as rotas que chamam a IA (scan, dive, financials) passaram a **fail-closed** (503 quando o contador não responde); o resto segue fail-open. A chave por cookie foi removida — o cliente a controla, então só o IP segura de fato. Janela fixa e limites preservados (scan 4/2h, dive e financials 20/h).
```

- [ ] **Step 4: Verifique**

```bash
npm run typecheck && npx vitest run
grep -rn "rate_limits" packages apps artefatos --include="*.sql" --include="*.ts" --include="*.md" | grep -v node_modules
```

Esperado: suíte verde, e nenhuma referência a `rate_limits` fora do texto histórico que você acabou de escrever.

- [ ] **Step 5: Commit**

```bash
git add apps/web/.env.example packages/server/db/schema.sql artefatos/arquiteturad.md
git commit -m "docs(limites): registra o contador no Upstash e completa o .env.example"
```

---

## Depois deste plano

Antes do deploy, criar o banco Upstash (marketplace do Vercel, plano grátis) e conferir que `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` chegaram nas envs do projeto. Sem elas, as rotas de IA passam a recusar com 503 — que é o comportamento desejado, mas deixa o scan fora do ar.

**Isto não conserta o site.** As rotas de dados (`/api/topics`, `/api/settings`, `/api/ideas`, `/api/scan/latest`) continuam dependendo do Postgres e continuam devolvendo 500 enquanto o Supabase estiver pausado. O que este plano garante é que, ligado ou desligado o banco, ninguém queima seus tokens.

Os próximos dois planos:

- **Plano 2 — dados no navegador:** `lib/storage.ts`, migração da UI, remoção das 4 rotas de CRUD e do cookie/`proxy.ts`. É o que devolve o site ao ar sem Postgres.
- **Plano 3 — boletim na web:** página `/boletim`, rota de geração pelo cron gravando no Upstash, rodízio determinístico de setores, remoção do Resend e da newsletter, e finalmente a exclusão de `db.ts`, `repo.ts` e `schema.sql`.
