import { describe, expect, it } from "vitest";
import { formatShortDate, insightKey, labelForType, LEAD_CATEGORY } from "./ui";

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

describe("LEAD_CATEGORY", () => {
  it("founder (lente única) lidera o brief com oportunidade", () => {
    expect(LEAD_CATEGORY).toBe("oportunidade");
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
