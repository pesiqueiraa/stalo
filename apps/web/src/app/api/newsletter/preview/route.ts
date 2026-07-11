import { assemble, renderBoletim } from "@stalo/server";
import { enforceRateLimit } from "@/lib/rateLimit";
import type { AssembledEdition } from "@stalo/shared";

// GET /api/newsletter/preview — renderiza o boletim na tela, SOB DEMANDA, pro
// Pedro VER o template. Dois modos:
//   • AMOSTRA (default, sem ?sectors): renderiza uma FIXTURE embutida. NÃO chama
//     assemble — funciona sem chave de IA nem banco, pro template aparecer na
//     hora.
//   • REAL (?sectors=IA,Fintech,Energia): monta a edição de verdade via
//     assemble(setores). ESTE MODO PRECISA de OPENAI_API_KEY + schema aplicado
//     (ingestão RSS + Analista + cache por combo no Postgres).
//
// TEST-SEND (envio real pro email de verdade) NÃO entra aqui: depende do ESP,
// que é o próximo estágio (decisão do Pedro). Esta rota só RENDERIZA.

const MAX_SECTORS = 5;
const PREVIEW_LIMIT = { bucket: "newsletter-preview", limit: 20, windowSeconds: 3600 };

// Fixture da amostra: 2 seções (BR/gringa), ~4 itens — 1 SEM imageUrl (regra
// dura: entra normalmente) — e 3 insights por seção. Dados ilustrativos.
const SAMPLE_EDITION: AssembledEdition = {
  weekStart: "2026-07-06",
  sectors: ["Inteligência Artificial", "Fintech", "Energia"],
  sections: [
    {
      origem: "BR",
      items: [
        {
          id: "br1",
          topic: "Inteligência Artificial",
          title:
            "Bancos põem copilot pra rodar internamente e o regulador já pede rastro de auditoria.",
          summary: "",
          source: "Valor Econômico",
          url: "https://example.com/ia-br",
          entities: [],
          publishedAt: "2026-07-08",
          imageUrl: "https://picsum.photos/seed/ia-br/208/156",
        },
        {
          // SEM imageUrl de propósito: precisa renderizar normalmente.
          id: "br2",
          topic: "Fintech",
          title: "Drex avança de fase e a liquidação de recebível on-chain deixa de ser teoria.",
          summary: "",
          source: "Brazil Journal",
          url: "https://example.com/fintech-br",
          entities: [],
          publishedAt: "2026-07-06",
        },
      ],
      insights: [
        {
          id: "br-i1",
          type: "tendencia",
          title: "Encanamento da nuvem",
          description:
            "O Brasil está montando o encanamento da nuvem: energia firme e rastro de auditoria são o mesmo movimento visto de dois ângulos.",
          rationale: "",
          whyNow: "",
          soWhat: "",
          related_items: [],
        },
        {
          id: "br-i2",
          type: "oportunidade",
          title: "Observabilidade de LLM",
          description:
            "Observabilidade de LLM pra banco regulado: a exigência de auditoria vira demanda antes de virar produto.",
          rationale: "",
          whyNow: "",
          soWhat: "",
          related_items: [],
        },
        {
          id: "br-i3",
          type: "gap",
          title: "Liquidação on-chain",
          description:
            "O Drex liga o trilho, mas ninguém conectou a liquidação on-chain ao recebível de saúde de verdade.",
          rationale: "",
          whyNow: "",
          soWhat: "",
          related_items: [],
        },
      ],
    },
    {
      origem: "GRINGA",
      items: [
        {
          id: "gr1",
          topic: "Inteligência Artificial",
          title:
            "Contexto longo virou commodity. A briga migrou pra memória que persiste entre sessões.",
          summary: "",
          source: "The Information",
          url: "https://example.com/ia-gringa",
          entities: [],
          publishedAt: "2026-07-07",
          imageUrl: "https://picsum.photos/seed/ia-gr/208/156",
        },
        {
          id: "gr2",
          topic: "Fintech",
          title: "Stablecoin de tesouraria deixou a mesa de câmbio e virou produto de PME.",
          summary: "",
          source: "Bloomberg",
          url: "https://example.com/fintech-gringa",
          entities: [],
          publishedAt: "2026-07-03",
          imageUrl: "https://picsum.photos/seed/fin-gr/208/156",
        },
      ],
      insights: [
        {
          id: "gr-i1",
          type: "tendencia",
          title: "Valor sobe e desce a pilha",
          description:
            "O valor sobe e desce a pilha ao mesmo tempo: o que era diferencial no meio (contexto, câmbio) virou commodity; a margem foi pra memória e pra energia.",
          rationale: "",
          whyNow: "",
          soWhat: "",
          related_items: [],
        },
        {
          id: "gr-i2",
          type: "oportunidade",
          title: "Stablecoin pra PME",
          description:
            "Stablecoin de tesouraria pra PME brasileira: virou padrão lá fora, não tem versão local.",
          rationale: "",
          whyNow: "",
          soWhat: "",
          related_items: [],
        },
        {
          id: "gr-i3",
          type: "gap",
          title: "Energy-for-compute",
          description:
            "Contrato de energy-for-compute nasceu nos EUA; aqui ainda não há quem estruture o mesmo trato.",
          rationale: "",
          whyNow: "",
          soWhat: "",
          related_items: [],
        },
      ],
    },
  ],
};

function htmlResponse(html: string): Response {
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("sectors");

  // modo AMOSTRA: sem ?sectors, renderiza a fixture (sem IA, sem banco).
  if (!raw) {
    return htmlResponse(renderBoletim(SAMPLE_EDITION));
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
