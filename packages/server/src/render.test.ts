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

describe("sampleEdition", () => {
  it("devolve uma edição válida com as duas seções (BR e gringa)", () => {
    const edition = sampleEdition();
    expect(edition.sections).toHaveLength(2);
    expect(edition.sections.map((s) => s.origem)).toEqual(["BR", "GRINGA"]);
    // toda seção tem itens (senão o render omite a seção)
    expect(edition.sections.every((s) => s.items.length > 0)).toBe(true);
    // ao menos um item SEM imageUrl (exercita a regra dura)
    const allItems = edition.sections.flatMap((s) => s.items);
    expect(allItems.some((it) => it.imageUrl === undefined)).toBe(true);
    // e renderiza sem quebrar
    expect(renderBoletim(edition).startsWith("<!doctype html>")).toBe(true);
  });
});
