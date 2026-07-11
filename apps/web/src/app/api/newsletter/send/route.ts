import { assemble, getActiveSubscribers, renderBoletim, sendBoletim } from "@stalo/server";

// GET /api/newsletter/send — CRON SEMANAL (Vercel Cron, ver vercel.json). Monta e
// envia o boletim da semana para cada assinante ativo. NÃO é o envio de teste
// (/test) nem o descadastro (/unsubscribe).
//
// PROTEÇÃO fail-closed: exige `Authorization: Bearer ${CRON_SECRET}` — o header
// que a Vercel Cron injeta automaticamente. Sem CRON_SECRET setada, ou sem bater,
// ninguém dispara o envio (regra 1: segredos só no server).

const SUBJECT = "Stalo · Boletim semanal";

export async function GET(request: Request) {
  // fail-closed: sem segredo configurado no ambiente, ninguém passa.
  const secret = process.env.CRON_SECRET;
  const authorized = !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Não autorizado." }), {
      status: 401,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  // base dos links absolutos (descadastro) no email. APP_URL opcional.
  const base = process.env.APP_URL ?? "https://stalo.dev";

  const subs = await getActiveSubscribers();
  let sent = 0;
  let failed = 0;

  // EM SEQUÊNCIA de propósito: assinantes com os mesmos setores reaproveitam o
  // cache de combo do assemble (o LLM roda 1x por combo/semana) e não estouram o
  // rate do Resend. Uma falha isolada NÃO aborta o lote.
  for (const sub of subs) {
    if (sub.sectors.length === 0) continue; // sem setores: nada a montar, pula
    try {
      const edition = await assemble(sub.sectors);
      const html = renderBoletim(edition, {
        email: sub.email,
        unsubscribeUrl: `${base}/api/newsletter/unsubscribe?id=${sub.id}`,
      });
      await sendBoletim({ to: sub.email, subject: SUBJECT, html });
      sent++;
    } catch (err) {
      // erro cru só no log; segue pro próximo assinante (nunca derruba o lote).
      console.error(`newsletter send failed for ${sub.email}`, err);
      failed++;
    }
  }

  return new Response(JSON.stringify({ sent, failed, total: subs.length }), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
