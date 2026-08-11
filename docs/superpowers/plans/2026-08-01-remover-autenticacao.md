# Remoção da Autenticação (workspace anônimo + limite 4 scans/2h) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover o login (Supabase Auth) por completo — o app volta a ser 100% grátis com workspace anônimo por cookie — e trocar o freio de custo de "1 scan grátis + conta" por **4 scans a cada 2 horas por IP+cookie**.

**Architecture:** O app já foi desenhado para funcionar sem login: todo dado é escopado por `workspace_id` (cookie `stalo_wid`), e o Supabase Auth era uma camada opcional por cima (`getAuthUserId` com fallback anônimo). O plano remove essa camada (páginas de auth, client Supabase, refresh de sessão no proxy, menu de perfil com identidade/sair), substitui o gate `signup_required` por um rate limit de scan mais apertado, e aponta os CTAs da landing direto para o produto (onboarding ou radar).

**Tech Stack:** Next.js App Router + TypeScript (apps/web), `@stalo/server` (Postgres/Supabase como **banco** — isso não muda aqui), Vitest.

## Global Constraints

- Textos de UI e mensagens de erro em **português**, tom direto (CLAUDE.md).
- Commits em **conventional commits, pt-br** (CLAUDE.md).
- A chave da LLM nunca vai ao client (CLAUDE.md regra 1) — nada neste plano toca isso, mas não introduzir regressão.
- **Nenhuma mudança de schema**: as tabelas já não têm nada de auth (o Supabase Auth vive em schema próprio do Supabase). `rate_limits` continua como está.
- Erros visíveis ao usuário, nunca silenciosos (CLAUDE.md) — o 429 do novo limite deve chegar legível na UI.
- Comandos sempre da raiz do monorepo: `npm run typecheck`, `npm test`, `npm run build`.
- **Nunca** rodar `npm run build` com o dev server ligado (corrompe `apps/web/.next` — ver memória "Turbopack stale cache"); antes do build de verificação, derrubar o dev server e `rm -rf apps/web/.next`.

**Fora de escopo deste plano:** migrar o banco de Supabase→Neon (é só trocar `DATABASE_URL` + rodar `schema.sql`; fica como follow-up). Nota de dados: registros criados por usuários logados (workspace_id = user_id do Supabase) ficam órfãos — para recuperar os seus, sete o cookie `stalo_wid` com o seu antigo user_id no navegador.

---

### Task 1: Novo limite de scan no backend — 4 por 2h, amarrado a IP E cookie

O gate atual é: rate limit 12/h por IP + "1 scan grátis por 90 dias, depois 401 `signup_required`". Vira: **4 scans por janela de 2h**, checando duas chaves (IP e workspace do cookie) — apagar o cookie não renova (o IP segura) e trocar de IP não renova (o cookie segura). Estourou → 429 com mensagem clara, `Retry-After` e **sem** gastar OpenAI. Fail-open mantido (banco fora ≠ endpoint quebrado).

**Files:**
- Modify: `apps/web/src/lib/rateLimit.ts`
- Modify: `apps/web/src/app/api/scan/route.ts`
- Test: `apps/web/src/app/api/scan/route.test.ts`

**Interfaces:**
- Consumes: `checkRateLimit(key, limit, windowSeconds)` de `@stalo/server` (já existe); `getWorkspaceId()` de `@/lib/workspace` (já existe).
- Produces: `enforceScanLimit(request: Request, workspaceId: string): Promise<NextResponse | null>` exportada de `@/lib/rateLimit` (null = passa; NextResponse = 429 pronto). Remove os exports `SCAN_LIMIT`, `FREE_SCAN` e `enforceFreeScanLimit` (ninguém mais os importa após esta task — `DIVE_LIMIT`/`FINANCIALS_LIMIT`/`enforceRateLimit` ficam, são usados pelas rotas de dive/financials).

- [ ] **Step 1: Reescrever o teste da rota para o novo gate (falhando)**

Substituir o conteúdo de `apps/web/src/app/api/scan/route.test.ts` por:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// A rota puxa IA + DB via @stalo/server e o workspace via @/lib/workspace.
// Mockamos tudo — o alvo é o LIMITE: 4 scans por 2h por IP+cookie, fail-open.
vi.mock("server-only", () => ({}));
vi.mock("@stalo/server", () => ({
  runScan: vi.fn(),
  saveScan: vi.fn(),
  checkRateLimit: vi.fn(),
}));
vi.mock("@/lib/workspace", () => ({
  getWorkspaceId: vi.fn(),
}));

import { POST } from "./route";
import { checkRateLimit, runScan, saveScan } from "@stalo/server";
import { getWorkspaceId } from "@/lib/workspace";

const mockCheck = vi.mocked(checkRateLimit);
const mockRunScan = vi.mocked(runScan);
const mockSaveScan = vi.mocked(saveScan);
const mockWid = vi.mocked(getWorkspaceId);

function req(): Request {
  return new Request("http://localhost/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "1.2.3.4" },
    body: JSON.stringify({ topics: ["IA"], days: null }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCheck.mockResolvedValue({ allowed: true, remaining: 1, retryAfterSeconds: 60 });
  mockRunScan.mockResolvedValue({ items: [], insights: [] });
  mockSaveScan.mockResolvedValue(undefined);
  mockWid.mockResolvedValue("wid-anon");
});

describe("POST /api/scan — limite de 4 scans por 2h", () => {
  it("dentro do limite passa e consome as chaves de IP e de workspace", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(mockCheck.mock.calls).toContainEqual(["scan:ip:1.2.3.4", 4, 7200]);
    expect(mockCheck.mock.calls).toContainEqual(["scan:wid:wid-anon", 4, 7200]);
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

  it("basta UMA das chaves estourar para bloquear (cookie novo não renova)", async () => {
    mockCheck.mockImplementation(async (key: string) => ({
      allowed: !key.startsWith("scan:ip:"),
      remaining: 0,
      retryAfterSeconds: 900,
    }));
    const res = await POST(req());
    expect(res.status).toBe(429);
    expect(mockRunScan).not.toHaveBeenCalled();
  });

  it("infra de rate limit fora → fail-open (scan segue)", async () => {
    mockCheck.mockRejectedValue(new Error("db down"));
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(mockRunScan).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- apps/web/src/app/api/scan/route.test.ts`
Expected: FAIL — a rota atual ainda usa `getAuthUserId` (mock ausente) e as chaves antigas (`scan:1.2.3.4`, `free-scan:*`).

- [ ] **Step 3: Reescrever o gate em `rateLimit.ts`**

Em `apps/web/src/lib/rateLimit.ts`, **remover** o bloco `SCAN_LIMIT`, o bloco `FREE_SCAN` e a função `enforceFreeScanLimit` (linhas 46 e 50–78), e adicionar no lugar:

```ts
// Limite do scan — o endpoint mais caro (busca web na OpenAI). Sem login, este
// é o único freio de custo: 4 scans por janela de 2h, amarrados ao IP E ao
// workspace do cookie — apagar o cookie não renova (o IP segura) e trocar de
// IP não renova (o cookie segura).
const SCAN = { bucket: "scan", limit: 4, windowSeconds: 2 * HOUR };

export async function enforceScanLimit(
  request: Request,
  workspaceId: string,
): Promise<NextResponse | null> {
  const keys = [`${SCAN.bucket}:ip:${clientIp(request)}`, `${SCAN.bucket}:wid:${workspaceId}`];
  let blocked: { retryAfterSeconds: number }[];
  try {
    const results = await Promise.all(
      keys.map((key) => checkRateLimit(key, SCAN.limit, SCAN.windowSeconds)),
    );
    blocked = results.filter((r) => !r.allowed);
  } catch (err) {
    // falha ABERTA, como no enforceRateLimit: infra fora não derruba o endpoint
    console.error("scan limit check failed (allowing request)", err);
    return null;
  }
  if (blocked.length === 0) return null;
  const retryAfter = Math.max(...blocked.map((r) => r.retryAfterSeconds));
  return NextResponse.json(
    { error: "Você usou seus 4 scans desta janela de 2 horas. Volte daqui a pouco." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}
```

Manter intactos: `clientIp`, `enforceRateLimit`, `DIVE_LIMIT`, `FINANCIALS_LIMIT` e `const HOUR = 3600`.

- [ ] **Step 4: Simplificar a rota do scan**

Em `apps/web/src/app/api/scan/route.ts`:
- Imports: trocar por `import { runScan, saveScan } from "@stalo/server";`, `import { getWorkspaceId } from "@/lib/workspace";`, `import { enforceScanLimit } from "@/lib/rateLimit";`.
- Substituir os dois blocos de gate (o `enforceRateLimit(...SCAN_LIMIT...)` das linhas 37–45 e o bloco `getAuthUserId`/`enforceFreeScanLimit` das linhas 47–54) por:

```ts
  // rate limit ANTES de chamar a IA — o scan é o endpoint mais caro (busca
  // web). Um 429 aqui não gasta a OpenAI.
  const workspaceId = await getWorkspaceId();
  const limited = await enforceScanLimit(request, workspaceId);
  if (limited) return limited;
```

O restante (validação de `topics`/`days`, `runScan`, `saveScan`, tratamento de erro 502) fica como está.

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -- apps/web/src/app/api/scan/route.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/rateLimit.ts apps/web/src/app/api/scan/route.ts apps/web/src/app/api/scan/route.test.ts
git commit -m "feat(limites): scan vira 4 por 2h por IP+cookie, sem gate de conta"
```

---

### Task 2: Servidor sem sessão — `workspace.ts` cookie-only e `proxy.ts` sem Supabase

**Files:**
- Modify: `apps/web/src/lib/workspace.ts`
- Modify: `apps/web/src/proxy.ts`

**Interfaces:**
- Produces: `getWorkspaceId(): Promise<string>` mantém a assinatura (consumida por todas as rotas `/api/*` e, na Task 4, pelo `page.tsx`). `getAuthUserId` **deixa de existir** — após a Task 1 ninguém mais a importa (verificar no Step 3).

- [ ] **Step 1: `workspace.ts` só com o cookie**

Substituir o conteúdo por:

```ts
import "server-only";
import { cookies } from "next/headers";
import { WORKSPACE_COOKIE, WORKSPACE_COOKIE_MAX_AGE } from "./workspaceCookie";

// Resolve o "dono do dado" para as rotas /api/* escoparem todo acesso por ele:
// o workspace anônimo do cookie (produto.md §2). Sem login por decisão de
// produto — o isolamento entre visitantes é este id.
export async function getWorkspaceId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(WORKSPACE_COOKIE)?.value;
  if (existing) return existing;

  const wid = crypto.randomUUID();
  try {
    store.set(WORKSPACE_COOKIE, wid, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: WORKSPACE_COOKIE_MAX_AGE,
      path: "/",
    });
  } catch {
    // cookies().set pode lançar em contexto read-only; ignora — o proxy
    // cobre o caso normal, e o id gerado ainda escopa esta resposta.
  }
  return wid;
}
```

- [ ] **Step 2: `proxy.ts` sem refresh de sessão**

Substituir o conteúdo por (mantém só o cookie de workspace; o matcher não muda):

```ts
import { NextResponse, type NextRequest } from "next/server";
import { WORKSPACE_COOKIE, WORKSPACE_COOKIE_MAX_AGE } from "@/lib/workspaceCookie";

// Roda na requisição do documento e das rotas /api/*: garante o workspace
// anônimo (cookie) — o isolamento de dados sem login (produto.md §2). Cria o id
// AQUI, na navegação do documento, ANTES dos fetches paralelos pra /api/* —
// evita a corrida de três ids diferentes no primeiro load.
//
// Arquivo "proxy" = a convenção do Next 16 que substituiu "middleware".
export function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  if (!request.cookies.get(WORKSPACE_COOKIE)) {
    response.cookies.set(WORKSPACE_COOKIE, crypto.randomUUID(), {
      httpOnly: true, // só o servidor lê; o client nunca precisa do id
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production", // em dev (http) precisa ser false pra o cookie colar
      maxAge: WORKSPACE_COOKIE_MAX_AGE,
      path: "/",
    });
  }
  return response;
}

// roda em tudo menos assets estáticos — inclui as páginas e as rotas /api/*
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 3: Conferir que ninguém mais importa `getAuthUserId`**

Run: `grep -rn "getAuthUserId" apps/web/src`
Expected: nenhuma ocorrência.

- [ ] **Step 4: Rodar a suíte**

Run: `npm test`
Expected: PASS (os testes de rota mockam `@/lib/workspace`, então nada quebra).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/workspace.ts apps/web/src/proxy.ts
git commit -m "refactor(workspace): identidade só por cookie anônimo, proxy sem sessão Supabase"
```

---

### Task 3: Frontend sem convite de conta — `api.ts`, radar e `TopicsPanel`

O 401 `signup_required` não existe mais; o erro que importa agora é o 429, cuja mensagem do servidor deve chegar ao usuário (nunca falhar em silêncio).

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/app/radar/page.tsx`
- Modify: `apps/web/src/components/TopicsPanel.tsx`
- Test: `apps/web/src/lib/api.test.ts`

**Interfaces:**
- Produces: `requestScan(topics, days)` agora rejeita sempre com `Error` cuja `message` vem do corpo `{ error }` do servidor (via `parseError`). `SignupRequiredError` e `postAuthDestination` deixam de existir (o único consumidor de `postAuthDestination` é a página de login, apagada na Task 5 — a ordem Task 3 → Task 5 deixa o typecheck quebrado só dentro de arquivos que serão apagados; o typecheck completo roda na Task 6).
- `TopicsPanel` perde a prop `errorLink` (a prop `error: string | null` continua exibindo a mensagem).

- [ ] **Step 1: Reescrever `api.test.ts` (falhando)**

Substituir o conteúdo por:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestScan } from "./api";

function stubFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestScan — erros do servidor", () => {
  it("erro com corpo JSON usa a mensagem do servidor (ex.: 429 do limite)", async () => {
    stubFetch(429, { error: "Você usou seus 4 scans desta janela de 2 horas. Volte daqui a pouco." });
    const err = await requestScan(["IA"], null).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("4 scans");
  });

  it("erro sem mensagem cai no texto genérico", async () => {
    stubFetch(500, {});
    const err = await requestScan(["IA"], null).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("Falha ao buscar notícias.");
  });
});
```

Run: `npm test -- apps/web/src/lib/api.test.ts`
Expected: FAIL (o import de `SignupRequiredError` sumiu do teste mas `api.ts` ainda a exporta e o teste antigo não existe mais — o novo passa só depois do Step 2; se passar de primeira, siga em frente: o alvo do step é fixar o contrato novo).

- [ ] **Step 2: Simplificar `api.ts`**

- Remover a classe `SignupRequiredError` e o comentário acima dela (linhas 41–43).
- `requestScan` vira:

```ts
export async function requestScan(topics: string[], days: number | null): Promise<ScanResult> {
  const res = await fetch("/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topics, days }),
  });
  if (!res.ok) throw new Error(await parseError(res, "Falha ao buscar notícias."));
  return (await res.json()) as ScanResult;
}
```

- Remover `postAuthDestination` inteira (linhas 141–151, incluindo o comentário).

Run: `npm test -- apps/web/src/lib/api.test.ts` — Expected: PASS.

- [ ] **Step 3: Radar sem `signupCta`**

Em `apps/web/src/app/radar/page.tsx`:
- Remover `SignupRequiredError` da lista de imports de `@/lib/api` (linha 26).
- Remover o estado e o comentário (linhas 76–77): `const [signupCta, setSignupCta] = useState(false);`.
- Em `scan()`: remover a linha `setSignupCta(false);` e trocar o `catch` por:

```ts
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Não consegui buscar ou interpretar as notícias agora. Tente novamente em instantes.",
      );
    }
```

- Na chamada de `<TopicsPanel ...>` remover a linha `errorLink={signupCta ? { href: "/signup", label: "Criar conta grátis" } : null}`.

- [ ] **Step 4: `TopicsPanel` sem `errorLink`**

Em `apps/web/src/components/TopicsPanel.tsx`: remover a prop da interface (linha 29), da desestruturação (linha 54) e o bloco JSX que a renderiza (linhas ~150–153). Se `import Link from "next/link"` ficar sem uso, remover também.

- [ ] **Step 5: Rodar a suíte e commit**

Run: `npm test`
Expected: PASS.

```bash
git add apps/web/src/lib/api.ts apps/web/src/lib/api.test.ts apps/web/src/app/radar/page.tsx apps/web/src/components/TopicsPanel.tsx
git commit -m "refactor(radar): erro de limite vem do servidor, sem convite de criar conta"
```

---

### Task 4: Landing pública com CTA direto ao produto

Sem sessão para checar, o server component decide o destino do CTA pelo estado do workspace (mesmo critério do antigo `/auth/callback`): sem temas e sem lente → `/onboarding`; senão → `/radar`.

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/Landing.tsx`

**Interfaces:**
- Consumes: `listTopics(wid)` e `getLens(wid)` de `@stalo/server` (já exportadas — eram usadas pelo `/auth/callback`); `getWorkspaceId()` da Task 2.
- Produces: `Landing` recebe `{ dest: "/onboarding" | "/radar" }` no lugar de `{ authed: boolean }`.

- [ ] **Step 1: Reescrever `page.tsx`**

```tsx
import { getLens, listTopics } from "@stalo/server";
import { getWorkspaceId } from "@/lib/workspace";
import Landing from "./Landing";

// Landing pública. Sem login: o CTA leva direto ao produto — onboarding pra
// quem ainda não configurou nada (sem temas e sem lente), radar pros demais.
// A checagem roda no servidor pra o botão certo já sair renderizado.
export default async function Page() {
  let dest: "/onboarding" | "/radar" = "/onboarding";
  try {
    const wid = await getWorkspaceId();
    const [topics, lens] = await Promise.all([listTopics(wid), getLens(wid)]);
    if (topics.length > 0 || lens) dest = "/radar";
  } catch {
    // banco fora do ar → onboarding é o destino seguro pra um visitante novo
  }
  return <Landing dest={dest} />;
}
```

- [ ] **Step 2: Trocar os três blocos de CTA em `Landing.tsx`**

- Assinatura (linha 11): `export default function Landing({ dest }: { dest: "/onboarding" | "/radar" }) {` — atualizar também o comentário acima (linhas 8–10) para: `// Landing pública. 'dest' vem do server component (page.tsx): onboarding pra quem ainda não configurou, radar pros demais.`
- Nav (linhas 333–347), substituir o ternário inteiro dentro de `<div className="nav-cta">` por:

```tsx
            <Link className="btn btn-primary" href={dest}>
              Abrir o radar
            </Link>
```

- Hero (linhas 366–374), substituir o ternário dentro de `<div className="cta-row">` por (o `<a href="#como">` ao lado fica):

```tsx
              <Link className="btn btn-primary" href={dest}>
                Começar agora <span className="arrow">→</span>
              </Link>
```

- CTA final (linhas 666–674), substituir o ternário por (o `<a href="#pra-quem">` ao lado fica):

```tsx
            <Link className="btn btn-primary" href={dest}>
              Começar agora
            </Link>
```

- [ ] **Step 3: Conferir no navegador**

Run: `npm run dev` e abrir `http://localhost:3000` numa janela anônima.
Expected: nav/hero/CTA final com um único botão levando a `/onboarding`; depois de configurar temas, voltar à landing → botões levam a `/radar`. Parar o dev server ao final.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/page.tsx apps/web/src/app/Landing.tsx
git commit -m "feat(landing): CTA direto ao produto, sem entrar/criar conta"
```

---

### Task 5: Apagar páginas/client de auth e enxugar o ProfileMenu

**Files:**
- Delete: `apps/web/src/app/(auth)/` (login, signup, layout, GoogleButton, auth.css), `apps/web/src/app/auth/` (callback), `apps/web/src/lib/supabase/` (client.ts, server.ts)
- Modify: `apps/web/src/components/ProfileMenu.tsx`

**Interfaces:**
- `ProfileMenu({ lens, onLensChange })` mantém a assinatura usada por `Header.tsx` — só perde identidade e "Sair", vira o modal de preferências (lente).

- [ ] **Step 1: Apagar os diretórios de auth**

```bash
git rm -r "apps/web/src/app/(auth)" apps/web/src/app/auth apps/web/src/lib/supabase
```

- [ ] **Step 2: Enxugar `ProfileMenu.tsx`**

- Remover: `import { createSupabaseBrowser } ...` (linha 4), o tipo `Identity` e a função `initialsOf` (linhas 50–57), os estados `me`/`signingOut`, o `useEffect` que carrega a identidade, e a função `signOut`.
- Botão gatilho: manter `pm-trigger`, trocar o conteúdo e o rótulo —

```tsx
      <button
        ref={triggerRef}
        type="button"
        className="pm-trigger"
        style={{ ["--ring" as string]: activeColor, ["--c" as string]: activeColor }}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Abrir preferências"
      >
        {activeLens ? <LensIcon id={activeLens} /> : <span className="pm-initials">·</span>}
      </button>
```

- Bloco `{/* identidade */}` inteiro vira:

```tsx
            <div className="pm-id">
              <div className="pm-id-text">
                <h2 id="pm-title" className="pm-name">
                  Preferências
                </h2>
                <p className="pm-email">Como o radar prioriza o seu brief.</p>
              </div>
            </div>
```

- Remover o botão `{/* sair */}` (`pm-signout`) por completo. A seção da lente fica intacta.
- Atualizar o comentário do componente (linhas 66–68) para: `// Botão no canto do header que abre as preferências do workspace: troca de lente.`

- [ ] **Step 3: Limpar CSS morto**

Run: `grep -rn "pm-signout\|pm-avatar" apps/web/src`
Expected: apontar as regras órfãs (provavelmente em `globals.css` ou no CSS do radar) — remover os blocos `.pm-signout` e `.pm-avatar` se nada mais os usa. Cuidado com a memória "Panel selector override": remover só os blocos exatos, sem tocar seletores vizinhos.

- [ ] **Step 4: Conferir que o app compila sem os arquivos apagados**

Run: `grep -rn "supabase\|/login\|/signup\|GoogleButton" apps/web/src --include="*.ts" --include="*.tsx" -l`
Expected: nenhum arquivo com import/link quebrado — só menções em comentários sobre o **banco** (ex.: cold-start em `radar/page.tsx:107`), que podem ficar.

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/src
git commit -m "feat(auth)!: remove login — app volta a ser 100% anônimo por workspace"
```

---

### Task 6: Dependências, env e verificação completa

**Files:**
- Modify: `apps/web/package.json` (remover `@supabase/ssr` e `@supabase/supabase-js`)
- Modify: `apps/web/.env`, `apps/web/.env.local`, `apps/web/.env.example` (remover `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`; **manter** `DATABASE_URL` — o banco continua Supabase Postgres — e as demais chaves)

- [ ] **Step 1: Remover as dependências e reinstalar**

Remover as duas linhas `@supabase/*` de `apps/web/package.json`, então:

Run: `npm install`
Expected: lockfile atualizado sem pacotes `@supabase/*`.

- [ ] **Step 2: Limpar os `.env`**

Apagar as linhas `NEXT_PUBLIC_SUPABASE_URL=` e `NEXT_PUBLIC_SUPABASE_ANON_KEY=` dos três arquivos. Conferir com `grep -n SUPABASE apps/web/.env*` → nenhuma ocorrência.

- [ ] **Step 3: Verificação total (dev server DESLIGADO)**

```bash
rm -rf apps/web/.next
npm run typecheck && npm test && npm run build
```

Expected: os três passam. Se o typecheck acusar resíduo de auth, é arquivo esquecido das tasks anteriores — corrigir ali, não silenciar.

- [ ] **Step 4: Commit**

```bash
git add apps/web/package.json package-lock.json apps/web/.env.example
git commit -m "chore(deps): remove SDKs do Supabase Auth e envs de sessão"
```

(`.env`/`.env.local` não são versionados — conferir com `git status` que não entraram.)

---

### Task 7: Documentação e checklist de deploy

**Files:**
- Modify: `artefatos/produto.md` (§2 — parágrafo "Realidade do MVP hoje")
- Modify: `artefatos/arquiteturad.md` (nota de isolamento + registrar a decisão)
- Modify: `artefatos/roadmap.md`, `artefatos/notas.md` (menções a login/conta, se referirem ao fluxo removido)

- [ ] **Step 1: `produto.md` §2**

Substituir o parágrafo "Realidade do MVP hoje" (linha 15) por:

> **Realidade do MVP hoje:** o produto é **100% grátis e sem contas** (decisão de 2026-08: o Supabase Auth no free tier pausava por inatividade e derrubava o app; como o Stalo é peça de portfólio, sem plano de monetização, o login saiu). Cada visitante tem um **workspace anônimo** por cookie (`stalo_wid`, 1 ano): só vê os próprios temas/scans/ideias, e os dados vivem enquanto o cookie durar — limpar cookies ou trocar de aparelho recomeça do zero (trade-off aceito). O freio de custo de IA é **4 scans por janela de 2 horas**, amarrado a IP + cookie (apagar o cookie não renova; trocar de IP não renova) — mitigação invisível, sem fricção de cadastro.

- [ ] **Step 2: `arquiteturad.md`**

- Na nota "Isolamento por workspace anônimo" (linha ~174), trocar o trecho final "Não é autenticação: quando contas reais (magic link) entrarem, `workspace_id` vira `user_id`..." por: "Não é autenticação — e por decisão de produto não haverá login (ver `produto.md` §2); se um dia contas voltarem, `workspace_id` vira `user_id` sem reescrever as queries."
- Na seção de decisões técnicas, adicionar a entrada:

> - **Autenticação removida (2026-08)**: o app teve Supabase Auth (Google + e-mail/senha) por um período; saiu porque (1) o projeto free do Supabase pausava por inatividade e derrubava login e banco juntos, (2) o Stalo é peça de portfólio sem plano de monetização — conta não pagava seu custo de fricção. O que segurava abuso (scan grátis único + convite de conta) virou **rate limit de 4 scans/2h por IP+cookie** (`apps/web/src/lib/rateLimit.ts`, `enforceScanLimit`, chaves duplas `scan:ip:*`/`scan:wid:*` na tabela `rate_limits`). O banco **continua** sendo o Postgres do Supabase; migração para Neon é follow-up independente.

- [ ] **Step 3: Varredura nas menções restantes**

Run: `grep -n -iE "login|criar conta|signup|conta grátis" artefatos/*.md README.md`
Expected: ajustar qualquer menção ao fluxo removido (roadmap/notas têm 1–2 cada); menções a "conta" no sentido de newsletter/assinante ficam.

- [ ] **Step 4: Commit**

```bash
git add artefatos/ README.md
git commit -m "docs: registra remoção do login e o novo limite de 4 scans/2h"
```

- [ ] **Step 5: Checklist manual pós-merge (fora do repo — avisar o usuário)**

1. Vercel → Settings → Environment Variables: remover `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` (manter `DATABASE_URL`, `OPENAI_API_KEY`, `CRON_SECRET`, `APP_URL`).
2. Google Cloud Console: desativar o OAuth client usado pelo login (opcional).
3. Supabase → Authentication: pode ignorar; sem os SDKs nada mais chama o Auth.
4. Para recuperar os dados que estavam na sua conta: no navegador, setar o cookie `stalo_wid` com o seu antigo `user_id` do Supabase (os dados continuam no banco sob esse id).
