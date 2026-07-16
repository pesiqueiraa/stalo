# Verificação de e-mail no auth + scan grátis único — Design

> **STATUS (2026-07-16):** a Parte 1 (confirmação de e-mail) foi implementada e depois **revertida por decisão de produto** — a fricção no onboarding pesou mais que a validação do endereço. A Parte 2 (scan grátis único) está em produção. Se a Parte 1 voltar um dia, os commits revertidos servem de referência (`git log --grep "confirmação"`).

**Data:** 2026-07-16
**Branch:** `fix/auth-email-verification` (a partir de `main`)
**Origem:** feedback de usuário — o cadastro não valida o e-mail (brecha de segurança e econômica: contas falsas viram workspaces que rodam scans pagos na OpenAI).

## Problema

1. A confirmação de e-mail está **desligada** no projeto Supabase. Qualquer pessoa cria conta com e-mail inventado (inclusive o de terceiros) e entra logada na hora — o próprio código admite (`signup/page.tsx`, comentário "confirmação de e-mail desligada no projeto").
2. Visitante **sem conta nenhuma** também roda scan ilimitado (dentro do rate limit de 12/h por IP), via workspace anônimo por cookie. Cada scan chama a OpenAI com busca web — o endpoint mais caro.

Fora de escopo desta branch (decidido com o usuário):
- Double opt-in na newsletter (vetor de spam via Resend) — fica pra depois.
- Branch B2B "modo produto consolidado" (`feat/modo-produto`) — análise contínua do mercado sob a ótica de um produto já existente (reinvenção, parceiros comerciais). Terá brainstorm próprio depois desta correção; toca `scanPrompt.ts`, onboarding e possivelmente schema.

## Solução — Parte 1: confirmação de e-mail (Supabase nativo)

Usar o mecanismo nativo do Supabase em vez de sistema próprio de tokens (YAGNI).

### Configuração no painel Supabase (não é código)

- Ligar **Confirm email** no provider Email (Authentication → Sign In / Providers).
- Trocar o template **Confirm signup** para apontar pra
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`.
  O formato com `token_hash` é o recomendado pra apps SSR: o link funciona aberto em qualquer navegador/dispositivo, sem depender do PKCE do browser que iniciou o cadastro.
- Conferir **Site URL** e **Redirect URLs** de produção (Vercel).
- Antes de ligar a chave: confirmar no banco que as contas existentes têm `email_confirmed_at` preenchido (contas criadas com confirmação desligada nascem auto-confirmadas; sem migração esperada).

### Código

- **Nova rota `apps/web/src/app/auth/confirm/route.ts`** — recebe `token_hash` + `type`, chama `supabase.auth.verifyOtp()`. Sucesso: mesma decisão do callback OAuth (novato sem setores/lente → `/onboarding`, senão → `/radar`). Falha (link expirado/já usado): redireciona pra `/login?error=confirm`.
- **Login (`(auth)/login/page.tsx`)** — hoje todo erro de signIn vira "E-mail ou senha inválidos". Passa a tratar o erro `Email not confirmed` separadamente: mensagem "Confirme seu e-mail pra entrar" + botão **Reenviar link** (`supabase.auth.resend({ type: "signup", email })`) com feedback de enviado. Também mostra a mensagem de link inválido/expirado quando chega com `?error=confirm`, com o mesmo reenvio.
- **Signup (`(auth)/signup/page.tsx`)** — o caminho "sessão não veio → aviso de confirmação" já existe; ganha o mesmo botão de reenvio no aviso.
- **Google OAuth** — intocado (e-mail já verificado pelo Google).

## Solução — Parte 2: scan grátis único pra visitante

Visitante anônimo passa a ter **1 scan grátis**; depois disso, precisa criar conta (agora verificada). Usuário logado segue com o limite atual de 12/h por IP.

- **`api/scan/route.ts`** — resolve o usuário via Supabase (`getUser()`).
  - **Logado:** fluxo atual, sem mudança.
  - **Anônimo:** além do rate limit por IP existente, consome um bucket novo `free-scan` com **limite 1 e janela de 90 dias**, em **duas chaves**: `free-scan:ip:<ip>` e `free-scan:wid:<workspaceId>` — apagar o cookie não renova o brinde (o IP segura). Qualquer uma estourada → **401** com corpo `{ error: "Seu scan grátis já foi usado. Crie sua conta pra continuar.", code: "signup_required" }`.
  - Reusa `checkRateLimit` do `@stalo/server` — **sem mudança de schema**. Mantém o fail-open existente (infra de rate limit fora → deixa passar e loga).
- **`lib/api.ts`** — `requestScan` reconhece o 401 com `code: "signup_required"` e lança um erro tipado (distinto do erro genérico).
- **`radar/page.tsx`** — captura esse erro e mostra convite com link pro `/signup` em vez da mensagem genérica de falha.
- **`artefatos/produto.md` §2** — atualizar a descrição do visitante anônimo: de "usa sem conta" para "1 scan grátis, depois conta". `arquiteturad.md` não muda (schema intocado).

## Tratamento de erro

- Link de confirmação inválido/expirado: redirect visível pro login com mensagem e reenvio — nunca tela branca ou erro silencioso.
- Reenvio de link: sucesso e falha visíveis na UI (padrão do projeto: nunca falhar em silêncio).
- Free scan esgotado: 401 com mensagem própria em português, renderizada como convite (não como erro técnico).
- Rate limit indisponível: fail-open com log (comportamento já existente, preservado).

## Testes (TDD, padrão do `route.test.ts` existente)

- Gate do free-scan: logado passa; anônimo passa na 1ª vez; 2ª vez → 401 com `code: "signup_required"`; chave por IP segura mesmo com cookie novo.
- Rota `/auth/confirm`: token inválido → redirect pra `/login?error=confirm`; token válido → destino correto (onboarding vs. radar).
- Login: erro `Email not confirmed` mostra mensagem específica + reenvio (não "e-mail ou senha inválidos").

## Entrega

- Branch `fix/auth-email-verification`, commits convencionais em pt-br.
- Passos de painel do Supabase: via MCP onde a API permitir; o que for só-dashboard vira checklist pro usuário.
