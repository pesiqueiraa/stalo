import "server-only";
import { Resend } from "resend";

// Envio de email via Resend. SERVER-ONLY — a chave nunca sai do servidor
// (CLAUDE.md regra 1). Aqui só se ENVIA um HTML já pronto (o boletim vem de
// renderBoletim); montar/renderizar não é responsabilidade deste módulo.
//
// ENV que este módulo lê:
//   • RESEND_API_KEY      (obrigatória) — a chave da conta Resend.
//   • NEWSLETTER_FROM     (opcional)    — remetente. Default "Stalo
//       <onboarding@resend.dev>": o domínio de sandbox do Resend funciona SEM
//       verificar domínio, mas só entrega pro email DA CONTA Resend — perfeito
//       pra teste. Em produção vira algo como "Stalo <boletim@stalo.dev>" (com
//       o domínio verificado no Resend).

const DEFAULT_FROM = "Stalo <onboarding@resend.dev>";

export async function sendBoletim(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY não está configurada — o envio de email está desabilitado.");
  }
  const from = process.env.NEWSLETTER_FROM ?? DEFAULT_FROM;

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });

  // Resend não lança em erro de API — devolve { error }. Propaga a msg do
  // provider; quem chama é que mascara pro usuário.
  if (error) {
    throw new Error(`Resend recusou o envio: ${error.message}`);
  }
  if (!data?.id) {
    throw new Error("Resend não devolveu o id do envio.");
  }
  return { id: data.id };
}
