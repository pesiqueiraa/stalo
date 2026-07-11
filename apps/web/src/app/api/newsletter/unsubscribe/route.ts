import { unsubscribe } from "@stalo/server";

// GET /api/newsletter/unsubscribe?id=<uuid> — descadastro por 1 clique no link do
// boletim. Público: o UUID do assinante é o próprio token (não exige segredo),
// e a operação é idempotente (clicar duas vezes não quebra). Devolve uma página
// HTML simples (não JSON) porque o alvo é o navegador do assinante.

// mini-página HTML no tom Stalo (dark), sem depender de CSS do app.
function page(title: string, message: string, status: number): Response {
  const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <title>${title} · Stalo</title>
  </head>
  <body style="margin:0;background:#070b14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e9eefb;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="min-height:100vh;">
      <tr><td align="center" valign="middle" style="padding:40px 16px;">
        <table role="presentation" width="440" cellpadding="0" cellspacing="0" style="width:440px;max-width:100%;background:#0d1220;border:1px solid #1b2537;border-radius:16px;">
          <tr><td style="padding:34px 32px;">
            <div style="font-size:19px;font-weight:700;letter-spacing:-0.02em;color:#f3f6fc;">Stalo</div>
            <div style="font-size:16px;font-weight:600;color:#f3f6fc;margin-top:20px;">${title}</div>
            <div style="font-size:14px;line-height:1.6;color:#9aa7bd;margin-top:8px;">${message}</div>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return page(
      "Link inválido",
      "Esse link de descadastro está incompleto. Use o link do rodapé do boletim que você recebeu.",
      400,
    );
  }

  try {
    await unsubscribe(id);
    return page(
      "Pronto",
      "Pronto, você não vai mais receber o boletim. Mudou de ideia? É só assinar de novo na página da Stalo.",
      200,
    );
  } catch (err) {
    // erro cru (Postgres/infra) só no log; o assinante recebe uma página amigável.
    console.error("newsletter unsubscribe failed", err);
    return page(
      "Deu ruim aqui",
      "Não consegui concluir o descadastro agora. Tente de novo em alguns minutos.",
      502,
    );
  }
}
