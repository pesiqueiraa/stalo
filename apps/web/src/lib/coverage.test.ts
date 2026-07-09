import { describe, expect, it } from "vitest";
import { binCoverage, dayTime } from "./coverage";

const items = (...isos: string[]) => isos.map((publishedAt) => ({ publishedAt }));

describe("dayTime", () => {
  it("converte ISO válido e rejeita inválido/vazio", () => {
    expect(dayTime("2026-06-10")).toBeTypeOf("number");
    expect(dayTime("")).toBeNull();
    expect(dayTime("lixo")).toBeNull();
  });
});

describe("binCoverage", () => {
  it("uma notícia → uma barra, total 1", () => {
    const c = binCoverage(items("2026-06-10"))!;
    expect(c.bars).toEqual([1]);
    expect(c.total).toBe(1);
  });

  it("mesmo dia empilha na mesma barra", () => {
    const c = binCoverage(items("2026-06-10", "2026-06-10", "2026-06-10"))!;
    expect(c.bars).toEqual([3]);
    expect(c.spanDays).toBe(0);
  });

  it("preserva a soma das notícias nas barras", () => {
    const c = binCoverage(items("2026-06-05", "2026-06-10", "2026-06-18", "2026-07-01"))!;
    expect(c.bars.reduce((a, b) => a + b, 0)).toBe(4);
  });

  it("escolhe o balde pelo span (dia / semana / mês)", () => {
    expect(binCoverage(items("2026-06-01", "2026-06-10"))!.bucketLabel).toBe("por dia");
    expect(binCoverage(items("2026-05-01", "2026-06-29"))!.bucketLabel).toBe("por semana");
    expect(binCoverage(items("2026-01-01", "2026-07-19"))!.bucketLabel).toBe("por mês");
  });

  it("ignora datas inválidas mas conta as válidas", () => {
    const c = binCoverage(items("", "lixo", "2026-06-10", "2026-06-11"))!;
    expect(c.total).toBe(2);
  });

  it("retorna null quando nenhuma data é válida", () => {
    expect(binCoverage(items())).toBeNull();
    expect(binCoverage(items("", "x"))).toBeNull();
  });

  it("first/lastIso são as strings originais (sem shift de fuso)", () => {
    const c = binCoverage(items("2026-06-30", "2026-06-01", "2026-06-15"))!;
    expect(c.firstIso).toBe("2026-06-01");
    expect(c.lastIso).toBe("2026-06-30");
  });

  it("o último balde sempre contém a notícia mais recente", () => {
    const c = binCoverage(items("2026-06-01", "2026-06-30"))!;
    expect(c.bars[c.bars.length - 1]).toBeGreaterThanOrEqual(1);
  });
});
