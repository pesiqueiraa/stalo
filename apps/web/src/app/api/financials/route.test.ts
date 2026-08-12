import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedIdea } from "@stalo/shared";

// A rota puxa IA via @stalo/server. Mockamos tudo — os alvos são: o teto de
// entrada, a precondição (409 sem mergulho) e o LIMITE: 20/h por IP,
// fail-closed.
vi.mock("server-only", () => ({}));
vi.mock("@stalo/server", () => ({
  runFinancials: vi.fn(),
  checkRateLimit: vi.fn(),
}));

import { POST } from "./route";
import { checkRateLimit, runFinancials } from "@stalo/server";

const mockCheck = vi.mocked(checkRateLimit);
const mockRunFinancials = vi.mocked(runFinancials);

function fakeIdea(overrides: Partial<SavedIdea> = {}): SavedIdea {
  return {
    id: "idea-1",
    insightRef: "i1",
    type: "oportunidade",
    title: "Título",
    description: "Descrição",
    rationale: "Rationale",
    whyNow: "Why now",
    soWhat: "So what",
    notes: "",
    savedAt: "2026-08-01T00:00:00.000Z",
    relatedItems: [],
    deepDive: {
      typeAnalysis: { kind: "oportunidade", beachhead: "x", menorTeste: "y" },
      market: null,
      proximosPassos: [],
      sinais: [],
    },
    financials: null,
    ...overrides,
  };
}

function req(body: unknown): Request {
  return new Request("http://localhost/api/financials", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "1.2.3.4" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCheck.mockResolvedValue({ allowed: true, remaining: 19, retryAfterSeconds: 60 });
  mockRunFinancials.mockResolvedValue({
    mercado: "m",
    monetizacao: "mo",
    premissas: [],
    custoValidar: "c",
  } as never);
});

describe("POST /api/financials", () => {
  it("corpo inválido → 400, sem chamar runFinancials", async () => {
    const res = await POST(req({ lens: "founder" })); // sem 'idea'
    expect(res.status).toBe(400);
    expect(mockRunFinancials).not.toHaveBeenCalled();
  });

  it("sem mergulho → 409 com a mensagem exata, sem chamar runFinancials", async () => {
    const res = await POST(req({ idea: fakeIdea({ deepDive: null }), lens: null }));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("Mergulhe na ideia antes de aprofundar no financeiro.");
    expect(mockRunFinancials).not.toHaveBeenCalled();
    expect(mockCheck).not.toHaveBeenCalled();
  });

  it("contador fora → 503, sem chamar runFinancials (fail-closed)", async () => {
    mockCheck.mockRejectedValue(new Error("contador fora"));
    const res = await POST(req({ idea: fakeIdea(), lens: null }));
    expect(res.status).toBe(503);
    expect(mockRunFinancials).not.toHaveBeenCalled();
  });

  it("caminho feliz → 200 com a análise financeira no corpo", async () => {
    const fin = { mercado: "grande", monetizacao: "assinatura", premissas: ["p1"], custoValidar: "baixo" };
    mockRunFinancials.mockResolvedValue(fin as never);
    const idea = fakeIdea();
    const res = await POST(req({ idea, lens: "investor" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown;
    expect(body).toEqual(fin);
    expect(mockRunFinancials).toHaveBeenCalledWith(idea, "investor");
  });
});
