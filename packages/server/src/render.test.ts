import { describe, expect, it } from "vitest";
import type { AssembledEdition } from "@stalo/shared";
// render.ts é PURO (sem server-only/rede/db), então importa direto — sem mocks.
import { renderBoletim, sampleEdition } from "./render";

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
  it("a faixa da seção traz o título grande e o subtítulo (presença)", () => {
    const html = renderBoletim(brEdition([imgItem("h")]));
    expect(html).toContain("No Brasil");
    expect(html).toContain("O que mexeu por aqui essa semana."); // subtítulo da faixa
    // barra vertical de cor da seção (BR = verde) na faixa
    expect(html).toContain("border-left:5px solid #63d29b");
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
