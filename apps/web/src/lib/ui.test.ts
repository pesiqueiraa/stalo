import { describe, expect, it } from "vitest";
import { formatShortDate, insightKey, labelForType, LENS_LEAD_CATEGORY } from "./ui";

describe("insightKey", () => {
  it("normaliza tipo + título (trim + lowercase) para detectar 'já salva'", () => {
    expect(insightKey("gap", "  Minha Tese  ")).toBe("gap::minha tese");
  });
  it("mesma tese com caixa diferente gera a mesma chave", () => {
    expect(insightKey("tendencia", "Foo Bar")).toBe(insightKey("tendencia", "foo bar"));
  });
});

describe("labelForType", () => {
  it("rotula cada tipo", () => {
    expect(labelForType("tendencia")).toBe("Tendência");
    expect(labelForType("gap")).toBe("Gap de mercado");
    expect(labelForType("oportunidade")).toBe("Oportunidade");
  });
});

describe("LENS_LEAD_CATEGORY", () => {
  it("mapeia cada lente à categoria que ela lidera no brief", () => {
    expect(LENS_LEAD_CATEGORY.founder).toBe("oportunidade");
    expect(LENS_LEAD_CATEGORY.investor).toBe("gap");
    expect(LENS_LEAD_CATEGORY.explorer).toBe("tendencia");
  });
});

describe("formatShortDate", () => {
  it("formata uma data ISO válida (não devolve o ISO cru)", () => {
    const out = formatShortDate("2026-06-10");
    expect(out).not.toBe("2026-06-10");
    expect(out.length).toBeGreaterThan(0);
  });
  it("devolve a entrada quando a data é inválida", () => {
    expect(formatShortDate("lixo")).toBe("lixo");
  });
});
