import { assemble, renderBoletim, sampleEdition } from "@stalo/server";
import { enforceRateLimit } from "@/lib/rateLimit";

// GET /api/newsletter/preview — renderiza o boletim na tela, SOB DEMANDA, pro
// Pedro VER o template. Dois modos:
//   • AMOSTRA (default, sem ?sectors): renderiza a amostra compartilhada
//     (sampleEdition() de @stalo/server). NÃO chama assemble — funciona sem
//     chave de IA nem banco, pro template aparecer na hora.
//   • REAL (?sectors=IA,Fintech,Energia): monta a edição de verdade via
//     assemble(setores). ESTE MODO PRECISA de OPENAI_API_KEY + schema aplicado
//     (ingestão RSS + Analista + cache por combo no Postgres).
//
// A amostra vive em @stalo/server (sampleEdition), então preview e envio de
// teste mostram exatamente o mesmo boletim (DRY).
//
// TEST-SEND (envio real pro email) NÃO entra aqui: é /api/newsletter/test.
// Esta rota só RENDERIZA na tela.

const MAX_SECTORS = 5;
const PREVIEW_LIMIT = { bucket: "newsletter-preview", limit: 20, windowSeconds: 3600 };

function htmlResponse(html: string): Response {
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("sectors");

  // modo AMOSTRA: sem ?sectors, renderiza a amostra (sem IA, sem banco).
  if (!raw) {
    return htmlResponse(renderBoletim(sampleEdition()));
  }

  // modo REAL: parseia os setores (split, trim, remove vazio, dedupe, cap 5).
  const sectors = Array.from(
    new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    ),
  ).slice(0, MAX_SECTORS);
  if (sectors.length === 0) {
    return new Response("Passe ao menos um setor em ?sectors=IA,Fintech.", {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const limited = await enforceRateLimit(
    request,
    PREVIEW_LIMIT.bucket,
    PREVIEW_LIMIT.limit,
    PREVIEW_LIMIT.windowSeconds,
  );
  if (limited) return limited;

  try {
    const edition = await assemble(sectors);
    return htmlResponse(renderBoletim(edition));
  } catch (err) {
    // erro cru só no log do servidor; o Pedro vê uma mensagem amigável (nunca
    // falha em silêncio — CLAUDE.md).
    console.error("newsletter preview failed", err);
    return new Response("Não consegui montar o boletim agora. Tente de novo em instantes.", {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}
