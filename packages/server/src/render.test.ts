import { describe, expect, it } from "vitest";
import type { AssembledEdition } from "@stalo/shared";
// render.ts é PURO (sem server-only/rede/db), então importa direto — sem mocks.
import { renderBoasVindas, renderBoletim, sampleEdition } from "./render";

// Fixture enxuta: duas origens; um item COM imagem, um SEM; título com caractere
// especial (<, &, ") pra exercitar o escape; os três tipos de insight.
const EDITION: AssembledEdition = {
  weekStart: "2026-07-06",
  sectors: ["IA", "Fintech"],
  sections: [
    {
      origem: "BR",
      items: [
        {
          id: "br1",
          topic: "IA",
          title: "Copilot & auditoria: bancos <internos> pedem \"rastro\".",
          summary: "Copilots internos entraram em produção e o BC quer log de cada sugestão.",
          source: "Valor",
          url: "https://example.com/br1",
          entities: [],
          publishedAt: "2026-07-08",
          imageUrl: "https://img.example.com/br1.jpg",
        },
        {
          // SEM imageUrl: precisa aparecer mesmo assim (regra dura).
          id: "br2",
          topic: "Fintech",
          title: "Drex avanca sem imagem nenhuma.",
          summary: "",
          source: "Brazil Journal",
          url: "https://example.com/br2",
          entities: [],
          publishedAt: "2026-07-06",
        },
      ],
      insights: [
        {
          id: "i1",
          type: "tendencia",
          title: "t",
          description: "Tendência do encanamento.",
          rationale: "",
          whyNow: "",
          soWhat: "",
          related_items: [],
        },
        {
          id: "i2",
          type: "oportunidade",
          title: "o",
          description: "Oportunidade de observabilidade.",
          rationale: "",
          whyNow: "",
          soWhat: "",
          related_items: [],
        },
        {
          id: "i3",
          type: "gap",
          title: "g",
          description: "Gap na liquidação.",
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
          topic: "IA",
          title: "Memória persistente virou a briga.",
          summary: "",
          source: "The Information",
          url: "https://example.com/gr1",
          entities: [],
          publishedAt: "2026-07-07",
          imageUrl: "https://img.example.com/gr1.jpg",
        },
      ],
      insights: [],
    },
  ],
};

describe("renderBoletim", () => {
  const html = renderBoletim(EDITION);

  it("é um documento HTML completo", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html.trimEnd().endsWith("</html>")).toBe(true);
  });

  it("mostra as duas origens (No Brasil e Na gringa)", () => {
    expect(html).toContain("No Brasil");
    expect(html).toContain("Na gringa");
  });

  it("renderiza o item COM imagem e o SEM imagem (o sem-imagem não some)", () => {
    // a imagem do item com imageUrl aparece
    expect(html).toContain("https://img.example.com/br1.jpg");
    // exatamente 2 <img no boletim (br1 e gr1); o item br2 não gera <img
    expect(html.match(/<img/g)?.length).toBe(2);
    // e o título do item SEM imagem está presente mesmo assim
    expect(html).toContain("Drex avanca sem imagem nenhuma.");
  });

  it("traz os três glifos de insight", () => {
    expect(html).toContain("▲"); // tendência
    expect(html).toContain("★"); // oportunidade
    expect(html).toContain("◆"); // gap
    expect(html).toContain("TENDÊNCIA");
    expect(html).toContain("OPORTUNIDADE");
    expect(html).toContain("GAP");
  });

  it("escapa caracteres especiais do texto do feed", () => {
    // o título cru NÃO deve aparecer com < & " brutos; deve vir escapado
    expect(html).toContain("Copilot &amp; auditoria: bancos &lt;internos&gt; pedem &quot;rastro&quot;.");
    expect(html).not.toContain("bancos <internos>");
  });

  it("renderiza o resumo quando presente e omite a linha quando vazio", () => {
    // br1 tem summary → aparece (escapado); br2 tem summary vazio → sem linha extra
    expect(html).toContain("Copilots internos entraram em produção e o BC quer log de cada sugestão.");
    // o item SEM summary continua renderizando normalmente (título presente)
    expect(html).toContain("Drex avanca sem imagem nenhuma.");
  });

  it("omite o bloco de insights de uma seção sem insights", () => {
    // só a seção BR tem insights → uma única ocorrência do cabeçalho do bloco
    expect(html.match(/O que isso conecta/g)?.length).toBe(1);
  });
});

// --- layout "capa editorial": hero + grade de 2 colunas ---------------------

// monta uma edição de 1 seção BR (sem insights) com os itens dados.
function brEdition(items: AssembledEdition["sections"][number]["items"]): AssembledEdition {
  return {
    weekStart: "2026-07-06",
    sectors: ["IA"],
    sections: [{ origem: "BR", items, insights: [] }],
  };
}

// item com imagem, título = o rótulo (pra localizar no HTML).
const imgItem = (label: string): AssembledEdition["sections"][number]["items"][number] => ({
  id: label,
  topic: "IA",
  title: label,
  summary: "",
  source: "Fonte",
  url: `https://example.com/${label}`,
  entities: [],
  publishedAt: "2026-07-07",
  imageUrl: `https://img.example.com/${label}.jpg`,
});

describe("renderBoletim — layout hero + grade", () => {
  it("a faixa da seção traz SÓ o título grande, sem subtítulo", () => {
    const html = renderBoletim(brEdition([imgItem("h")]));
    expect(html).toContain("No Brasil");
    expect(html).not.toContain("O que mexeu por aqui essa semana."); // subtítulo removido
    // barra vertical de cor da seção (BR = verde) na faixa + gradiente com fallback sólido
    expect(html).toContain('width="6" style="width:6px;background:#63d29b');
    expect(html).toContain("background-image:linear-gradient(90deg,");
  });

  it("hero SEM imagem vira card de texto — não some e não gera <img>", () => {
    const html = renderBoletim(
      brEdition([
        {
          id: "hero",
          topic: "IA",
          title: "Hero sem foto",
          summary: "resumo do hero grande",
          source: "Fonte",
          url: "https://example.com/hero",
          entities: [],
          publishedAt: "2026-07-08",
        },
      ]),
    );
    expect(html).toContain("Hero sem foto");
    expect(html).toContain("resumo do hero grande"); // hero mostra o resumo
    expect(html.match(/<img/g)).toBeNull(); // nenhuma imagem no boletim
  });

  it("grade com número ÍMPAR de cards deixa a última célula vazia (4 células .col)", () => {
    // 1 hero + 3 na grade → 2 linhas de 2 células = 4 .col (a última vazia)
    const html = renderBoletim(brEdition([imgItem("hero"), imgItem("g1"), imgItem("g2"), imgItem("g3")]));
    expect((html.match(/class="col"/g) ?? []).length).toBe(4);
    // todos os itens aparecem (nada some)
    ["hero", "g1", "g2", "g3"].forEach((t) => expect(html).toContain(t));
  });

  it("card de grade SEM imagem renderiza (barra de cor no lugar da foto)", () => {
    const html = renderBoletim(
      brEdition([
        imgItem("heroComFoto"), // hero com imagem → 1 <img>
        {
          id: "g1",
          topic: "IA",
          title: "Grade sem foto",
          summary: "",
          source: "Fonte",
          url: "https://example.com/g1",
          entities: [],
          publishedAt: "2026-07-06",
        },
      ]),
    );
    expect(html).toContain("Grade sem foto");
    // só a imagem do hero: o card de grade sem foto não gera <img>
    expect((html.match(/<img/g) ?? []).length).toBe(1);
  });

  it("container tem 720px de largura e a media query pra empilhar a grade no mobile", () => {
    const html = renderBoletim(brEdition([imgItem("hero"), imgItem("g1")]));
    expect(html).toContain('width="720"');
    expect(html).toContain("@media only screen and (max-width: 620px)");
    expect(html).toContain(".col {");
  });
});

describe("renderBoletim — header/logo", () => {
  it("com logoUrl usa <img> com alt e estilos de texto no próprio img (fallback do alt)", () => {
    const html = renderBoletim(brEdition([imgItem("h")]), { logoUrl: "https://cdn.example/logo-email.png" });
    expect(html).toContain('src="https://cdn.example/logo-email.png"');
    expect(html).toContain('alt="Stalo"');
    // o Gmail estiliza o ALT pelos estilos de texto no <img> quando a imagem falha
    expect(html).toMatch(/<img[^>]+alt="Stalo"[^>]+font-weight:800/);
    expect(html).toMatch(/<img[^>]+alt="Stalo"[^>]+font-size:24px/);
  });

  it("sem logoUrl mantém o wordmark em texto (preview local não depende de rede)", () => {
    const html = renderBoletim(brEdition([imgItem("h")]));
    expect(html).not.toContain('alt="Stalo"'); // nenhum <img> de logo
    expect(html).toContain("Stalo<span"); // wordmark em texto com o ponto âmbar
  });

  it("fecha o header com um fio de toque âmbar", () => {
    const html = renderBoletim(brEdition([imgItem("h")]));
    expect(html).toContain("linear-gradient(90deg,#e8a23d");
  });
});

describe("renderBoasVindas", () => {
  it("é um documento HTML completo com a abertura e o preheader", () => {
    const html = renderBoasVindas({ sectors: ["Inteligência Artificial", "Fintech"] });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html.trimEnd().endsWith("</html>")).toBe(true);
    expect(html).toContain("Você tá dentro.");
    expect(html).toContain('width="640"'); // container "carta", mais estreito que o boletim (720)
    // copy sem travessão (feedback do Pedro: texto natural, sem cara de IA)
    expect(html).not.toContain("—");
  });

  it("renderiza os chips dos setores com esc() e cores estáveis por ordem", () => {
    const html = renderBoasVindas({ sectors: ["IA", "Fintech & Cia", "IA"] });
    // esc() no setor com &
    expect(html).toContain("Fintech &amp; Cia");
    expect(html).not.toContain("Fintech & Cia");
    // cores estáveis: 1º setor = 1ª cor da paleta (#5ec8d8), 2º = 2ª (#63d29b)
    expect(html).toContain("border:1px solid #5ec8d8;color:#5ec8d8;");
    expect(html).toContain("border:1px solid #63d29b;color:#63d29b;");
  });

  it("omite o bloco de chips quando sectors está vazio (não quebra)", () => {
    const html = renderBoasVindas({ sectors: [] });
    expect(html).not.toContain("Seus setores");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("Você tá dentro."); // resto continua
  });

  it("traz o card 'O que chega' com os três glifos/rótulos de insight", () => {
    const html = renderBoasVindas({ sectors: ["IA"] });
    expect(html).toContain("O que chega pra você");
    ["▲", "★", "◆", "TENDÊNCIA", "OPORTUNIDADE", "GAP"].forEach((t) => expect(html).toContain(t));
    expect(html).toContain("segunda, 9h de Brasília");
  });

  it("com logoUrl usa <img> (alt estilizado); sem, wordmark em texto", () => {
    const withLogo = renderBoasVindas({ sectors: ["IA"], logoUrl: "https://cdn.example/logo-email.png" });
    expect(withLogo).toContain('src="https://cdn.example/logo-email.png"');
    expect(withLogo).toMatch(/<img[^>]+alt="Stalo"[^>]+font-weight:800/);

    const noLogo = renderBoasVindas({ sectors: ["IA"] });
    expect(noLogo).not.toContain('alt="Stalo"');
    expect(noLogo).toContain("Stalo<span");
  });

  it("deriva o link do radar do host do unsubscribeUrl; sem ele, cai em /radar", () => {
    const abs = renderBoasVindas({
      sectors: ["IA"],
      unsubscribeUrl: "https://stalo.dev/api/newsletter/unsubscribe?id=abc",
    });
    expect(abs).toContain('href="https://stalo.dev/radar"');
    // e o descadastro usa a URL passada
    expect(abs).toContain('href="https://stalo.dev/api/newsletter/unsubscribe?id=abc"');

    const rel = renderBoasVindas({ sectors: ["IA"] });
    expect(rel).toContain('href="/radar"');
  });

  it("mostra o email no rodapé quando informado", () => {
    const html = renderBoasVindas({ sectors: ["IA"], email: "a@b.com" });
    expect(html).toContain("Você assinou com o email");
    expect(html).toContain("a@b.com");
  });
});

describe("sampleEdition", () => {
  it("devolve uma edição válida com as duas seções (BR e gringa)", () => {
    const edition = sampleEdition();
    expect(edition.sections).toHaveLength(2);
    expect(edition.sections.map((s) => s.origem)).toEqual(["BR", "GRINGA"]);
    // toda seção tem itens (senão o render omite a seção)
    expect(edition.sections.every((s) => s.items.length > 0)).toBe(true);
    // 5 itens por seção (1 hero + 4 grade) pra exercitar a grade de verdade
    expect(edition.sections.every((s) => s.items.length === 5)).toBe(true);
    // ao menos um item SEM imageUrl e ao menos um SEM summary (regra dura)
    const allItems = edition.sections.flatMap((s) => s.items);
    expect(allItems.some((it) => it.imageUrl === undefined)).toBe(true);
    expect(allItems.some((it) => it.summary === "")).toBe(true);
    // e renderiza sem quebrar
    expect(renderBoletim(edition).startsWith("<!doctype html>")).toBe(true);
  });
});
