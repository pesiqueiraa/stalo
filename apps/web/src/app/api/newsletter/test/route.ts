import { assemble, renderBoletim, sampleEdition, sendBoletim } from "@stalo/server";
import { enforceRateLimit } from "@/lib/rateLimit";

// POST /api/newsletter/test — ENVIO DE TESTE sob demanda: renderiza o boletim e
// manda de verdade via Resend, pro Pedro receber no próprio email. NÃO é o cron
// semanal nem o descadastrar (parte 4b) — é só um gatilho manual protegido.
//
// PROTEÇÃO (fail-closed): exige o segredo de admin. Se NEWSLETTER_ADMIN_SECRET
// não estiver setada, OU o header `x-admin-secret` (ou body.secret) não bater →
// 401. Sem segredo configurado, ninguém envia.
//
// Modos:
//   • AMOSTRA (sample===true ou sem sectors): usa a amostra compartilhada
//     (sampleEdition). Só precisa de RESEND_API_KEY — sem IA nem banco.
//   • REAL (sectors não vazio): monta a edição via assemble(setores). Precisa de
//     OPENAI_API_KEY + schema aplicado, além da RESEND_API_KEY.

const MAX_SECTORS = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEST_LIMIT = { bucket: "newsletter-test", limit: 20, windowSeconds: 3600 };
const SUBJECT = "Stalo · Boletim semanal (teste)";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function POST(request: Request) {
  let body: { email?: unknown; sectors?: unknown; sample?: unknown; secret?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "Corpo da requisição inválido." }, 400);
  }

  // PROTEÇÃO fail-closed: sem segredo configurado no ambiente, ninguém passa.
  const adminSecret = process.env.NEWSLETTER_ADMIN_SECRET;
  const provided =
    request.headers.get("x-admin-secret") ??
    (typeof body.secret === "string" ? body.secret : null);
  if (!adminSecret || provided !== adminSecret) {
    return json({ error: "Não autorizado." }, 401);
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!EMAIL_RE.test(email)) {
    return json({ error: "Confere o email." }, 400);
  }

  // sectors é opcional; se vier, precisa ser lista de strings.
  if (body.sectors !== undefined && !(Array.isArray(body.sectors) && body.sectors.every((s) => typeof s === "string"))) {
    return json({ error: "Envie 'sectors' como uma lista de strings." }, 400);
  }
  const sectorList = Array.isArray(body.sectors)
    ? Array.from(
        new Set((body.sectors as string[]).map((s) => s.trim()).filter((s) => s.length > 0)),
      ).slice(0, MAX_SECTORS)
    : [];

  // amostra quando pedida explicitamente ou quando não há setores válidos.
  const useSample = body.sample === true || sectorList.length === 0;

  const limited = await enforceRateLimit(
    request,
    TEST_LIMIT.bucket,
    TEST_LIMIT.limit,
    TEST_LIMIT.windowSeconds,
    { failClosed: true },
  );
  if (limited) return limited;

  // logo hospedado no mesmo host do app; sem APP_URL o render usa o wordmark texto.
  const logoUrl = process.env.APP_URL ? `${process.env.APP_URL}/logo-email.png` : undefined;

  try {
    const html = useSample
      ? renderBoletim(sampleEdition(), { email, logoUrl })
      : renderBoletim(await assemble(sectorList), { email, logoUrl });
    const { id } = await sendBoletim({ to: email, subject: SUBJECT, html });
    return json({ ok: true, id });
  } catch (err) {
    // erro cru (Resend/IA/DB) só no log; o admin recebe uma mensagem amigável.
    console.error("newsletter test send failed", err);
    return json({ error: "Não consegui enviar o boletim de teste agora." }, 502);
  }
}
