import { describe, expect, it, vi } from "vitest";

// newsletter.ts é server-only e puxa scan.ts (instancia OpenAI) e repo.ts (db).
// Aqui só exercitamos os HELPERS PUROS (weekStart/comboKey), então isolamos as
// dependências pesadas — nenhum LLM/DB é tocado. O caminho com LLM/DB (crossCombo/
// assemble) precisa de OPENAI_API_KEY + schema aplicado e NÃO roda em unit test.
vi.mock("server-only", () => ({}));
vi.mock("./scan", () => ({ analyze: vi.fn() }));
vi.mock("./repo", () => ({ ensureEdition: vi.fn(), getEdition: vi.fn(), saveCombo: vi.fn() }));

import { comboKey, weekStart } from "./newsletter";

describe("weekStart", () => {
  it("uma quarta cai na segunda daquela semana (UTC)", () => {
    // 2024-01-01 foi uma segunda; 2024-01-03 é quarta.
    expect(weekStart(new Date("2024-01-03T12:00:00Z"))).toBe("2024-01-01");
  });

  it("uma segunda mapeia pra ela mesma", () => {
    expect(weekStart(new Date("2024-01-01T00:00:00Z"))).toBe("2024-01-01");
  });

  it("um domingo cai na segunda anterior (semana ISO seg–dom)", () => {
    expect(weekStart(new Date("2024-01-07T23:59:00Z"))).toBe("2024-01-01");
  });

  it("a próxima segunda inicia uma nova semana", () => {
    expect(weekStart(new Date("2024-01-08T09:00:00Z"))).toBe("2024-01-08");
  });
});

describe("comboKey", () => {
  it("ordena os setores e junta com '+'", () => {
    expect(comboKey(["Inteligência Artificial", "Fintech"])).toBe("Fintech+Inteligência Artificial");
  });

  it("é estável pra ordens de escolha diferentes (mesma chave)", () => {
    expect(comboKey(["Fintech", "Inteligência Artificial"])).toBe(
      comboKey(["Inteligência Artificial", "Fintech"]),
    );
  });

  it("um único setor vira ele mesmo", () => {
    expect(comboKey(["Energia"])).toBe("Energia");
  });

  it("não muta o array de entrada", () => {
    const input = ["Web3", "Clima"];
    comboKey(input);
    expect(input).toEqual(["Web3", "Clima"]);
  });
});
