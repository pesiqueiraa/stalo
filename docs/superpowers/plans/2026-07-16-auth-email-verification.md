# Verificação de e-mail + scan grátis único — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar a brecha de e-mail não verificado no auth (Supabase nativo) e limitar o visitante anônimo a 1 scan grátis.

**Architecture:** Confirmação de e-mail via mecanismo nativo do Supabase (toggle no painel + rota `/auth/confirm` com `verifyOtp`), com reenvio de link no login/signup. Gate do scan reusa o `checkRateLimit` do Postgres com bucket novo `free-scan` (limite 1, janela 90 dias) por IP **e** por workspace-cookie; usuário logado não passa pelo gate.

**Tech Stack:** Next.js App Router (rotas em `apps/web/src/app`), `@supabase/ssr` + `@supabase/supabase-js`, Postgres via `@stalo/server`, vitest (config na raiz; alias `@/` → `apps/web/src`; só `.test.ts`, ambiente node — componentes React ficam em typecheck + verificação manual).

**Spec:** `docs/superpowers/specs/2026-07-16-auth-email-verification-design.md`

## Global Constraints

- Branch `fix/auth-email-verification` (já criada e ativa). Commits convencionais **em pt-br**.
- Textos de UI e mensagens de erro **em português**, tom direto (padrão do projeto).
- Chave de IA nunca no client (CLAUDE.md regra 1) — nada aqui toca isso, mas não introduzir.
- Erros sempre visíveis ao usuário — nunca falhar em silêncio.
- Rate limit permanece **fail-open** (infra fora → deixa passar e loga), como o existente.
- Sem mudança de schema (logo `arquiteturad.md` não muda).
- Comandos rodam da raiz do repo: `npm test` (vitest), `npm run typecheck`.
- NUNCA rodar `npm run build` com o dev server ligado (corrompe `apps/web/.next`).

---

### Task 1: Rota `/auth/confirm` + helper `postAuthDest`

O link de confirmação de e-mail do Supabase (template com `token_hash`) aterrissa aqui. A decisão "onboarding vs. radar" já existe inline no callback OAuth — extraímos pra um helper compartilhado.

**Files:**
- Create: `apps/web/src/lib/postAuthDest.ts`
- Create: `apps/web/src/app/auth/confirm/route.ts`
- Modify: `apps/web/src/app/auth/callback/route.ts`
- Test: `apps/web/src/app/auth/confirm/route.test.ts`

**Interfaces:**
- Consumes: `createSupabaseServer()` de `@/lib/supabase/server`; `getWorkspaceId()` de `@/lib/workspace`; `getLens`/`listTopics` de `@stalo/server`.
- Produces: `postAuthDest(): Promise<"/onboarding" | "/radar">` (usada pelo callback e pelo confirm); rota `GET /auth/confirm?token_hash=…&type=email`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/web/src/app/auth/confirm/route.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

// A rota usa Supabase (verifyOtp) e o destino pós-auth (que puxa DB). Mockamos
// os dois — aqui o alvo é o CONTRATO da rota: redirects certos em cada caso.
const { verifyOtp } = vi.hoisted(() => ({ verifyOtp: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServer: vi.fn(async () => ({ auth: { verifyOtp } })),
}));
vi.mock("@/lib/postAuthDest", () => ({
  postAuthDest: vi.fn(async () => "/radar"),
}));

import { GET } from "./route";

function req(qs: string): Request {
  return new Request(`http://localhost/auth/confirm${qs}`);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /auth/confirm — link de confirmação de e-mail", () => {
  it("sem token_hash → volta pro login com aviso, sem chamar o Supabase", async () => {
    const res = await GET(req(""));
    expect(res.headers.get("location")).toBe("http://localhost/login?error=confirm");
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("token inválido/expirado → volta pro login com aviso", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "Token expired" } });
    const res = await GET(req("?token_hash=abc&type=email"));
    expect(res.headers.get("location")).toBe("http://localhost/login?error=confirm");
  });

  it("token válido → segue pro destino pós-auth", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const res = await GET(req("?token_hash=abc&type=email"));
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "abc", type: "email" });
    expect(res.headers.get("location")).toBe("http://localhost/radar");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- apps/web/src/app/auth/confirm/route.test.ts`
Expected: FAIL — `Cannot find module './route'` (ou equivalente).

- [ ] **Step 3: Implementar helper e rota**

Criar `apps/web/src/lib/postAuthDest.ts`:

```ts
import "server-only";
import { getLens, listTopics } from "@stalo/server";
import { getWorkspaceId } from "@/lib/workspace";

// Destino pós-autenticação (OAuth ou confirmação de e-mail): quem ainda não
// tem setores nem lente vai pro onboarding; os demais, direto pro radar.
export async function postAuthDest(): Promise<"/onboarding" | "/radar"> {
  try {
    const wid = await getWorkspaceId();
    const [topics, lens] = await Promise.all([listTopics(wid), getLens(wid)]);
    if (topics.length === 0 && !lens) return "/onboarding";
  } catch {
    // se a checagem falhar, o radar é o destino seguro
  }
  return "/radar";
}
```

Criar `apps/web/src/app/auth/confirm/route.ts`:

```ts
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase/server";
import { postAuthDest } from "@/lib/postAuthDest";

// Link de confirmação de e-mail: o template "Confirm signup" do Supabase aponta
// pra cá com ?token_hash&type. verifyOtp valida o token e cria a sessão — o
// formato token_hash funciona aberto em qualquer navegador (não depende do PKCE
// do browser que iniciou o cadastro). Link expirado/já usado volta pro login
// com aviso visível (?error=confirm), nunca tela de erro crua.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (!token_hash || !type) {
    return NextResponse.redirect(`${origin}/login?error=confirm`);
  }

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.verifyOtp({ token_hash, type });
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=confirm`);
  }
  return NextResponse.redirect(`${origin}${await postAuthDest()}`);
}
```

Em `apps/web/src/app/auth/callback/route.ts`, trocar a decisão inline pelo helper — o arquivo inteiro fica:

```ts
import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { postAuthDest } from "@/lib/postAuthDest";

// Retorno do OAuth (Google): o Supabase manda o visitante de volta pra cá com um
// ?code. Trocamos o code por sessão e decidimos pra onde ir — quem ainda não tem
// setores nem lente vai pro onboarding; os demais, direto pro radar.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }
  return NextResponse.redirect(`${origin}${await postAuthDest()}`);
}
```

- [ ] **Step 4: Rodar testes e typecheck**

Run: `npm test -- apps/web/src/app/auth/confirm/route.test.ts && npm run typecheck`
Expected: 3 testes PASS; typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/postAuthDest.ts apps/web/src/app/auth/confirm apps/web/src/app/auth/callback/route.ts
git commit -m "feat(auth): rota /auth/confirm pro link de confirmação de e-mail"
```

---

### Task 2: Login — conta não confirmada + reenvio de link

Hoje qualquer erro do `signInWithPassword` vira "E-mail ou senha inválidos". Conta não confirmada precisa de mensagem própria + botão de reenviar o link. Também tratamos a chegada com `?error=confirm` (link expirado vindo da Task 1).

**Files:**
- Modify: `apps/web/src/app/(auth)/login/page.tsx`

**Interfaces:**
- Consumes: `createSupabaseBrowser()` (já importado); `supabase.auth.resend({ type: "signup", email })`.
- Produces: nada consumido por outras tasks.

Sem teste unitário (componente React; vitest do projeto só cobre `.test.ts` em node). Verificação: typecheck + fluxo manual na Task 7.

- [ ] **Step 1: Estados e detecção do erro**

Em `apps/web/src/app/(auth)/login/page.tsx`, adicionar estados junto aos existentes:

```ts
// conta que ainda não confirmou o e-mail (null = fluxo normal de erro)
const [confirmEmail, setConfirmEmail] = useState<string | null>(null);
const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle");
```

No `useEffect` que hoje só trata `error=oauth`, cobrir também o link expirado:

```ts
useEffect(() => {
  const err = new URLSearchParams(window.location.search).get("error");
  if (err === "oauth") {
    setErrors({ form: "Não consegui entrar com o Google. Tente de novo." });
  } else if (err === "confirm") {
    setErrors({
      form: "Link de confirmação inválido ou expirado. Entre com e-mail e senha pra receber outro.",
    });
  }
}, []);
```

No `onSubmit`, logo após `setErrors(e); if (...) return;`, resetar o aviso: `setConfirmEmail(null); setResendState("idle");`. E no branch de erro do `signInWithPassword`, separar o caso não-confirmado (o supabase-js sinaliza com `error.code === "email_not_confirmed"`; o teste da mensagem cobre versões antigas):

```ts
if (error) {
  const unconfirmed =
    error.code === "email_not_confirmed" || /email not confirmed/i.test(error.message);
  if (unconfirmed) {
    setConfirmEmail(email.trim());
  } else {
    // não revela qual campo falhou (segurança)
    setErrors({ form: "E-mail ou senha inválidos." });
  }
  setLoading(false);
  return;
}
```

- [ ] **Step 2: Reenvio + JSX**

Adicionar o handler (depois do `onSubmit`):

```ts
async function resendConfirmation() {
  if (!confirmEmail || resendState === "sending") return;
  setResendState("sending");
  const supabase = createSupabaseBrowser();
  const { error } = await supabase.auth.resend({ type: "signup", email: confirmEmail });
  setResendState(error ? "error" : "sent");
}
```

No JSX, substituir a linha `{errors.form && <p className="auth-form-error">{errors.form}</p>}` por:

```tsx
{confirmEmail ? (
  <div className="auth-notice">
    Confirme seu e-mail pra entrar. Enviamos um link pra {confirmEmail}.{" "}
    <button
      type="button"
      className="auth-link"
      onClick={resendConfirmation}
      disabled={resendState === "sending"}
    >
      {resendState === "sending"
        ? "Reenviando…"
        : resendState === "sent"
          ? "Link reenviado ✓"
          : "Reenviar link"}
    </button>
    {resendState === "error" && (
      <span className="field-error"> Não consegui reenviar. Tente de novo.</span>
    )}
  </div>
) : (
  errors.form && <p className="auth-form-error">{errors.form}</p>
)}
```

Conferir em `apps/web/src/app/(auth)/auth.css` se `.auth-link` estiliza `<button>` além de `<a>` (hoje é usado num `<Link>`); se não, acrescentar ao seletor existente `button.auth-link` com `background: none; border: none; cursor: pointer; padding: 0; font: inherit;`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: limpo.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(auth)/login/page.tsx" "apps/web/src/app/(auth)/auth.css"
git commit -m "feat(auth): login trata conta não confirmada com reenvio do link"
```

---

### Task 3: Signup — reenvio de link no aviso de confirmação

O signup já mostra o aviso quando a sessão não vem (confirmação ligada). Falta o botão de reenviar no próprio aviso.

**Files:**
- Modify: `apps/web/src/app/(auth)/signup/page.tsx`

**Interfaces:**
- Consumes: `supabase.auth.resend({ type: "signup", email })` (mesmo padrão da Task 2).
- Produces: nada consumido por outras tasks.

- [ ] **Step 1: Estado + handler + JSX**

Em `apps/web/src/app/(auth)/signup/page.tsx`, adicionar estado junto aos existentes:

```ts
const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle");
```

Handler (depois do `onSubmit`):

```ts
async function resendConfirmation() {
  if (resendState === "sending") return;
  setResendState("sending");
  const supabase = createSupabaseBrowser();
  const { error } = await supabase.auth.resend({ type: "signup", email: email.trim() });
  setResendState(error ? "error" : "sent");
}
```

Substituir `{notice && <p className="auth-notice">{notice}</p>}` por:

```tsx
{notice && (
  <div className="auth-notice">
    {notice}{" "}
    <button
      type="button"
      className="auth-link"
      onClick={resendConfirmation}
      disabled={resendState === "sending"}
    >
      {resendState === "sending"
        ? "Reenviando…"
        : resendState === "sent"
          ? "Link reenviado ✓"
          : "Reenviar link"}
    </button>
    {resendState === "error" && (
      <span className="field-error"> Não consegui reenviar. Tente de novo.</span>
    )}
  </div>
)}
```

Se `.auth-notice` estiver estilizado só pra `p`, garantir que o `div` herda o mesmo visual (seletor por classe, não por tag).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: limpo.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(auth)/signup/page.tsx" "apps/web/src/app/(auth)/auth.css"
git commit -m "feat(auth): reenvio do link de confirmação no aviso do cadastro"
```

---

### Task 4: Gate do scan grátis no `/api/scan`

Visitante anônimo: 1 scan grátis (90 dias), amarrado a IP **e** cookie de workspace. Logado: fluxo atual. Sem mudança de schema — reusa `checkRateLimit`.

**Files:**
- Modify: `apps/web/src/lib/workspace.ts`
- Modify: `apps/web/src/lib/rateLimit.ts`
- Modify: `apps/web/src/app/api/scan/route.ts`
- Test: `apps/web/src/app/api/scan/route.test.ts`

**Interfaces:**
- Consumes: `checkRateLimit(key, limit, windowSeconds): Promise<{ allowed, remaining, retryAfterSeconds }>` de `@stalo/server`.
- Produces:
  - `getAuthUserId(): Promise<string | null>` em `@/lib/workspace` (null = anônimo).
  - `enforceFreeScanLimit(request: Request, workspaceId: string): Promise<NextResponse | null>` em `@/lib/rateLimit` (401 com `code: "signup_required"` quando estourado).
  - Contrato HTTP consumido pela Task 5: `POST /api/scan` → `401 { error: string, code: "signup_required" }`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/web/src/app/api/scan/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// A rota puxa IA + DB via @stalo/server e sessão via @/lib/workspace. Mockamos
// tudo — o alvo é o GATE: logado passa, anônimo tem 1 brinde, fail-open vale.
vi.mock("server-only", () => ({}));
vi.mock("@stalo/server", () => ({
  runScan: vi.fn(),
  saveScan: vi.fn(),
  checkRateLimit: vi.fn(),
}));
vi.mock("@/lib/workspace", () => ({
  getAuthUserId: vi.fn(),
  getWorkspaceId: vi.fn(),
}));

import { POST } from "./route";
import { checkRateLimit, runScan, saveScan } from "@stalo/server";
import { getAuthUserId, getWorkspaceId } from "@/lib/workspace";

const mockCheck = vi.mocked(checkRateLimit);
const mockRunScan = vi.mocked(runScan);
const mockSaveScan = vi.mocked(saveScan);
const mockAuthUser = vi.mocked(getAuthUserId);
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
  mockAuthUser.mockResolvedValue(null);
  mockWid.mockResolvedValue("wid-anon");
});

describe("POST /api/scan — gate do scan grátis", () => {
  it("anônimo no 1º scan passa e consome as duas chaves do brinde", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    const keys = mockCheck.mock.calls.map(([key]) => key);
    expect(keys).toContain("free-scan:ip:1.2.3.4");
    expect(keys).toContain("free-scan:wid:wid-anon");
    expect(mockSaveScan).toHaveBeenCalledWith("wid-anon", ["IA"], { items: [], insights: [] });
  });

  it("anônimo com brinde gasto → 401 signup_required, sem gastar OpenAI", async () => {
    mockCheck.mockImplementation(async (key: string) => ({
      allowed: !key.startsWith("free-scan:"),
      remaining: 0,
      retryAfterSeconds: 60,
    }));
    const res = await POST(req());
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("signup_required");
    expect(mockRunScan).not.toHaveBeenCalled();
  });

  it("logado não passa pelo gate do brinde", async () => {
    mockAuthUser.mockResolvedValue("user-1");
    const res = await POST(req());
    expect(res.status).toBe(200);
    const keys = mockCheck.mock.calls.map(([key]) => key);
    expect(keys.some((k) => k.startsWith("free-scan:"))).toBe(false);
    expect(mockSaveScan).toHaveBeenCalledWith("user-1", ["IA"], { items: [], insights: [] });
  });

  it("infra de rate limit fora → fail-open (scan segue)", async () => {
    mockCheck.mockRejectedValue(new Error("db down"));
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(mockRunScan).toHaveBeenCalled();
  });

  it("limite por IP estourado continua devolvendo 429 (comportamento existente)", async () => {
    mockCheck.mockImplementation(async (key: string) => ({
      allowed: !key.startsWith("scan:"),
      remaining: 0,
      retryAfterSeconds: 60,
    }));
    const res = await POST(req());
    expect(res.status).toBe(429);
    expect(mockRunScan).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- apps/web/src/app/api/scan/route.test.ts`
Expected: FAIL — `getAuthUserId` não existe em `@/lib/workspace` (erro de import/mocked) e/ou chaves `free-scan:` nunca consultadas.

- [ ] **Step 3: Implementar**

Em `apps/web/src/lib/workspace.ts`, extrair a resolução do usuário logado (o bloco "1) sessão autenticada tem prioridade" de `getWorkspaceId`) pra função exportada, e usar no `getWorkspaceId`:

```ts
// Id do usuário autenticado (Supabase), ou null se a visita é anônima.
export async function getAuthUserId(): Promise<string | null> {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    try {
      const supabase = await createSupabaseServer();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) return user.id;
    } catch {
      // Supabase indisponível/erro de sessão: trata como anônimo
    }
  }
  return null;
}
```

E `getWorkspaceId` passa a começar com:

```ts
// 1) sessão autenticada tem prioridade
const userId = await getAuthUserId();
if (userId) return userId;
```

Em `apps/web/src/lib/rateLimit.ts`, adicionar ao final:

```ts
// Brinde do visitante anônimo: 1 scan grátis por janela de 90 dias, amarrado
// ao IP E ao workspace do cookie — apagar o cookie não renova o brinde (o IP
// segura). Estourou → 401 com code "signup_required", que o frontend rende
// como convite pra criar conta (não como erro técnico).
export const FREE_SCAN = { bucket: "free-scan", limit: 1, windowSeconds: 90 * 24 * HOUR };

export async function enforceFreeScanLimit(
  request: Request,
  workspaceId: string,
): Promise<NextResponse | null> {
  const keys = [
    `${FREE_SCAN.bucket}:ip:${clientIp(request)}`,
    `${FREE_SCAN.bucket}:wid:${workspaceId}`,
  ];
  try {
    const results = await Promise.all(
      keys.map((key) => checkRateLimit(key, FREE_SCAN.limit, FREE_SCAN.windowSeconds)),
    );
    if (results.every((r) => r.allowed)) return null;
  } catch (err) {
    // falha ABERTA, como no enforceRateLimit: infra fora não derruba o endpoint
    console.error("free scan check failed (allowing request)", err);
    return null;
  }
  return NextResponse.json(
    { error: "Seu scan grátis já foi usado. Crie sua conta pra continuar.", code: "signup_required" },
    { status: 401 },
  );
}
```

Atenção: `HOUR` já existe no arquivo (`const HOUR = 3600`), definido DEPOIS do ponto de uso se adicionar no final — conferir a ordem (constantes no fim do arquivo hoje; adicionar `FREE_SCAN` junto dos outros limites e a função antes/depois conforme o `const` hoisting de `HOUR` permitir — `const` não faz hoisting entre statements de módulo, então `FREE_SCAN` deve vir DEPOIS da linha `const HOUR = 3600`).

Em `apps/web/src/app/api/scan/route.ts`:

1. Trocar imports:

```ts
import { getAuthUserId, getWorkspaceId } from "@/lib/workspace";
import { enforceFreeScanLimit, enforceRateLimit, SCAN_LIMIT } from "@/lib/rateLimit";
```

2. Depois do `if (limited) return limited;`, inserir:

```ts
// visitante anônimo tem direito a 1 scan grátis; depois disso, conta (com
// e-mail verificado). Usuário logado segue só com o limite por IP acima.
const userId = await getAuthUserId();
const workspaceId = userId ?? (await getWorkspaceId());
if (!userId) {
  const gated = await enforceFreeScanLimit(request, workspaceId);
  if (gated) return gated;
}
```

3. No `try`, trocar `await saveScan(await getWorkspaceId(), topics, result);` por `await saveScan(workspaceId, topics, result);`.

- [ ] **Step 4: Rodar testes e typecheck**

Run: `npm test && npm run typecheck`
Expected: suíte toda PASS (novos + newsletter + existentes); typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/workspace.ts apps/web/src/lib/rateLimit.ts apps/web/src/app/api/scan/route.ts apps/web/src/app/api/scan/route.test.ts
git commit -m "feat(scan): visitante anônimo tem 1 scan grátis; depois, conta"
```

---

### Task 5: Frontend — erro tipado e convite pra criar conta no radar

O 401 `signup_required` vira `SignupRequiredError` no client; o radar mostra convite com link pro `/signup` em vez do erro genérico.

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/app/radar/page.tsx`
- Modify: `apps/web/src/components/TopicsPanel.tsx`
- Test: `apps/web/src/lib/api.test.ts`

**Interfaces:**
- Consumes: contrato HTTP da Task 4 (`401 { error, code: "signup_required" }`).
- Produces: `SignupRequiredError` (classe exportada de `@/lib/api`); prop nova `errorLink?: { href: string; label: string } | null` no `TopicsPanel`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/web/src/lib/api.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestScan, SignupRequiredError } from "./api";

function stubFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestScan — erros do gate", () => {
  it("401 signup_required vira SignupRequiredError com a mensagem do servidor", async () => {
    stubFetch(401, { error: "Seu scan grátis já foi usado.", code: "signup_required" });
    const err = await requestScan(["IA"], null).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SignupRequiredError);
    expect((err as Error).message).toBe("Seu scan grátis já foi usado.");
  });

  it("outros erros seguem como Error genérico (não SignupRequiredError)", async () => {
    stubFetch(500, { error: "boom" });
    const err = await requestScan(["IA"], null).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(SignupRequiredError);
    expect((err as Error).message).toBe("boom");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test -- apps/web/src/lib/api.test.ts`
Expected: FAIL — `SignupRequiredError` não é exportado.

- [ ] **Step 3: Implementar `lib/api.ts`**

Adicionar antes de `requestScan`:

```ts
// O visitante anônimo gastou o scan grátis: a rota devolve 401 com
// code "signup_required" e o radar rende convite pra criar conta.
export class SignupRequiredError extends Error {}
```

E `requestScan` vira:

```ts
export async function requestScan(topics: string[], days: number | null): Promise<ScanResult> {
  const res = await fetch("/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topics, days }),
  });
  if (res.status === 401) {
    let data: { error?: string; code?: string } = {};
    try {
      data = (await res.json()) as { error?: string; code?: string };
    } catch {
      // sem corpo JSON — cai no erro genérico abaixo
    }
    if (data.code === "signup_required") {
      throw new SignupRequiredError(data.error ?? "Crie sua conta pra continuar escaneando.");
    }
    throw new Error(data.error ?? "Falha ao buscar notícias.");
  }
  if (!res.ok) throw new Error(await parseError(res, "Falha ao buscar notícias."));
  return (await res.json()) as ScanResult;
}
```

- [ ] **Step 4: Rodar o teste**

Run: `npm test -- apps/web/src/lib/api.test.ts`
Expected: PASS.

- [ ] **Step 5: Radar + TopicsPanel**

Em `apps/web/src/app/radar/page.tsx`:

- Incluir `SignupRequiredError` no import de `@/lib/api` (lista de imports por volta da linha 24).
- Estado novo junto ao `error`: `const [signupCta, setSignupCta] = useState(false);`
- Na função `scan()`: junto do `setError(null)` inicial, `setSignupCta(false);`. O `catch` vira:

```ts
} catch (err) {
  console.error(err);
  if (err instanceof SignupRequiredError) {
    setError(err.message);
    setSignupCta(true);
  } else {
    setError(
      "Não consegui buscar ou interpretar as notícias agora. Tente novamente em instantes.",
    );
  }
}
```

- No JSX, na `<TopicsPanel …>`, adicionar a prop:

```tsx
errorLink={signupCta ? { href: "/signup", label: "Criar conta grátis" } : null}
```

Em `apps/web/src/components/TopicsPanel.tsx`:

- `import Link from "next/link";`
- Na interface de props, adicionar `errorLink?: { href: string; label: string } | null;` (e `errorLink` na desestruturação).
- Trocar `{error && <div className="error-banner">{error}</div>}` por:

```tsx
{error && (
  <div className="error-banner">
    {error}
    {errorLink && (
      <>
        {" "}
        <Link href={errorLink.href}>{errorLink.label}</Link>
      </>
    )}
  </div>
)}
```

- [ ] **Step 6: Suíte + typecheck**

Run: `npm test && npm run typecheck`
Expected: tudo PASS; typecheck limpo.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/lib/api.test.ts apps/web/src/app/radar/page.tsx apps/web/src/components/TopicsPanel.tsx
git commit -m "feat(scan): radar convida a criar conta quando o scan grátis acaba"
```

---

### Task 6: produto.md + configuração do Supabase

Documentação alinhada à nova regra do visitante e a parte de painel do Supabase (única etapa fora do código).

**Files:**
- Modify: `artefatos/produto.md` (§2, parágrafo "Realidade do MVP hoje")

**Interfaces:** nada consumido por outras tasks.

- [ ] **Step 1: Atualizar produto.md §2**

Substituir o parágrafo "**Realidade do MVP hoje:**" (que ainda descreve o produto como "sem login") por:

```markdown
**Realidade do MVP hoje:** o produto tem **contas de verdade** (Supabase Auth: e-mail+senha com confirmação de e-mail obrigatória, ou Google) e mantém o workspace anônimo por cookie (`stalo_wid`) como camada de degustação: o visitante sem conta navega à vontade e tem direito a **1 scan grátis** (janela de 90 dias, amarrado a IP + cookie — apagar o cookie não renova); depois disso, o scan pede conta. Cada workspace (o `user_id` de quem está logado, ou o cookie do visitante) só vê os próprios temas/scans/ideias. Os dados do workspace anônimo vivem enquanto o cookie durar; a conta é o caminho pra durabilidade. Tiers e cobrança seguem pós-validação (ver `roadmap.md`).
```

- [ ] **Step 2: Verificar contas existentes no banco (antes de ligar a chave)**

Via MCP do Supabase (`execute_sql`), no projeto do Stalo:

```sql
select count(*) as total,
       count(*) filter (where email_confirmed_at is null) as unconfirmed
from auth.users;
```

Expected: `unconfirmed = 0` (contas criadas com confirmação desligada nascem auto-confirmadas). Se aparecer alguém não confirmado, reportar ao usuário antes de prosseguir — essas contas passariam a ser bloqueadas no login.

- [ ] **Step 3: Configuração no painel (checklist pro usuário — dashboard não é acessível via MCP)**

Entregar ao usuário este checklist:

1. **Authentication → Sign In / Providers → Email**: ligar **Confirm email**.
2. **Authentication → Emails → Confirm signup**: trocar o corpo pra apontar o link pra
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`.
3. **Authentication → URL Configuration**: conferir que a **Site URL** é o domínio de produção (Vercel) e que `http://localhost:3000` está nas **Redirect URLs** pra dev.

- [ ] **Step 4: Commit**

```bash
git add artefatos/produto.md
git commit -m "docs(produto): visitante anônimo tem 1 scan grátis; contas com e-mail verificado"
```

---

### Task 7: Verificação final

- [ ] **Step 1: Suíte completa + typecheck + lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: tudo limpo.

- [ ] **Step 2: Verificação manual (dev server)**

Com `npm run dev` (NUNCA rodar build em paralelo — corrompe `.next`):

1. Janela anônima: rodar 1 scan → funciona; rodar o 2º → banner com "Seu scan grátis já foi usado…" + link "Criar conta grátis" levando ao `/signup`.
2. Logado: scan funciona normalmente (sem gate).
3. Com **Confirm email ligado** no Supabase: criar conta nova → aviso "enviamos um link…" com botão de reenvio; login antes de confirmar → "Confirme seu e-mail pra entrar" + reenvio; clicar o link do e-mail → cai no `/auth/confirm` e segue pro onboarding/radar; link usado de novo → `/login?error=confirm` com a mensagem de link expirado.
4. Login com Google → intocado.

- [ ] **Step 3: Encerramento da branch**

Usar o skill superpowers:finishing-a-development-branch (merge/PR conforme o usuário decidir).
