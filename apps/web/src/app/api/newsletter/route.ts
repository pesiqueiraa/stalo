import { NextResponse } from "next/server";
import { renderBoasVindas, saveSubscriber, sendBoletim } from "@stalo/server";
import { enforceRateLimit } from "@/lib/rateLimit";

// POST /api/newsletter — captura um assinante da newsletter (email + setores)
// vindo do popup da landing e faz upsert em `subscribers`. Persiste e, se for
// cadastro novo ou reativação, dispara o e-mail de boas-vindas (best-effort). NÃO
// é escopado por visitante — o assinante é um email numa mailing list, sem
// relação com os dados (temas, ideias) que cada visitante guarda no navegador.

const SUBJECT_WELCOME = "Stalo · Você tá dentro";

const MAX_SECTORS = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// rate limit por IP: barato, mas protege contra flood de cadastros de um bot.
const NEWSLETTER_LIMIT = { bucket: "newsletter", limit: 10, windowSeconds: 3600 };

export async function POST(request: Request) {
  let email: unknown;
  let sectors: unknown;
  try {
    const body = (await request.json()) as { email?: unknown; sectors?: unknown };
    email = body.email;
    sectors = body.sectors;
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const emailStr = typeof email === "string" ? email.trim() : "";
  if (!EMAIL_RE.test(emailStr)) {
    return NextResponse.json({ error: "Confere o email." }, { status: 400 });
  }

  if (!Array.isArray(sectors) || !sectors.every((s) => typeof s === "string")) {
    return NextResponse.json(
      { error: "Envie 'sectors' como uma lista de strings." },
      { status: 400 },
    );
  }
  // limpa: trim, remove vazios, dedupe e limita a 5. Exige ao menos um setor.
  const sectorList = Array.from(
    new Set((sectors as string[]).map((s) => s.trim()).filter((s) => s.length > 0)),
  ).slice(0, MAX_SECTORS);
  if (sectorList.length === 0) {
    return NextResponse.json({ error: "Escolha ao menos um setor." }, { status: 400 });
  }

  const limited = await enforceRateLimit(
    request,
    NEWSLETTER_LIMIT.bucket,
    NEWSLETTER_LIMIT.limit,
    NEWSLETTER_LIMIT.windowSeconds,
  );
  if (limited) return limited;

  try {
    const { id, outcome } = await saveSubscriber(emailStr, sectorList);

    // BOAS-VINDAS: só em cadastro novo ou reativação (submit duplicado do popup,
    // "unchanged", não reenvia). BEST-EFFORT — uma falha no email (Resend fora,
    // domínio não verificado) NUNCA derruba o cadastro: log e segue com sucesso.
    if (outcome === "new" || outcome === "reactivated") {
      try {
        const base = process.env.APP_URL ?? "https://stalo.dev";
        const html = renderBoasVindas({
          sectors: sectorList,
          email: emailStr,
          unsubscribeUrl: `${base}/api/newsletter/unsubscribe?id=${id}`,
          logoUrl: `${base}/logo-email.png`,
        });
        await sendBoletim({ to: emailStr, subject: SUBJECT_WELCOME, html });
      } catch (mailErr) {
        console.error("welcome email failed (cadastro segue ok)", mailErr);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    // o erro cru (Postgres/infra) fica só no log do servidor; o usuário recebe
    // uma mensagem amigável, sem vazar internals (CLAUDE.md: nunca em silêncio).
    console.error("newsletter subscribe failed", err);
    return NextResponse.json(
      { error: "Não consegui concluir sua inscrição agora." },
      { status: 502 },
    );
  }
}
