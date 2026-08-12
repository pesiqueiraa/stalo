import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedIdea } from "@stalo/shared";
import { MAX_BODY_BYTES } from "@/lib/aiPayload";

// A rota puxa IA via @stalo/server. Mockamos tudo — os alvos são: o teto de
// entrada (payload inválido nunca chega na IA) e o LIMITE: 20 dives por hora
// por IP, fail-closed.
vi.mock("server-only", () => ({}));
vi.mock("@stalo/server", () => ({
  runDeepDive: vi.fn(),
  checkRateLimit: vi.fn(),
}));

import { POST } from "./route";
import { checkRateLimit, runDeepDive } from "@stalo/server";

const mockCheck = vi.mocked(checkRateLimit);
const mockRunDeepDive = vi.mocked(runDeepDive);

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
    deepDive: null,
    financials: null,
    ...overrides,
  };
}

function req(body: unknown): Request {
  return new Request("http://localhost/api/dive", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "1.2.3.4" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCheck.mockResolvedValue({ allowed: true, remaining: 19, retryAfterSeconds: 60 });
  mockRunDeepDive.mockResolvedValue({
    typeAnalysis: null,
    market: null,
    proximosPassos: [],
    sinais: [],
  } as never);
});

describe("POST /api/dive", () => {
  it("corpo inválido → 400, sem consultar rate limit nem chamar runDeepDive", async () => {
    const res = await POST(req({ lens: "founder" })); // sem 'idea'
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBeTruthy();
    expect(mockCheck).not.toHaveBeenCalled();
    expect(mockRunDeepDive).not.toHaveBeenCalled();
  });

  it("corpo acima do teto de tamanho → 400, sem consultar rate limit nem chamar runDeepDive", async () => {
    const idea = fakeIdea({ notes: "x".repeat(MAX_BODY_BYTES + 1) });
    const res = await POST(req({ idea, lens: null }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/32\s*KB|tamanho/i);
    expect(mockCheck).not.toHaveBeenCalled();
    expect(mockRunDeepDive).not.toHaveBeenCalled();
  });

  it("contador fora → 503, sem chamar runDeepDive (fail-closed)", async () => {
    mockCheck.mockRejectedValue(new Error("contador fora"));
    const res = await POST(req({ idea: fakeIdea(), lens: null }));
    expect(res.status).toBe(503);
    expect(mockRunDeepDive).not.toHaveBeenCalled();
  });

  it("caminho feliz → 200 com o mergulho no corpo", async () => {
    const dive = {
      typeAnalysis: { kind: "oportunidade", beachhead: "x", menorTeste: "y" },
      market: null,
      proximosPassos: ["passo 1"],
      sinais: [],
    };
    mockRunDeepDive.mockResolvedValue(dive as never);
    const idea = fakeIdea();
    const res = await POST(req({ idea, lens: "founder" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown;
    expect(body).toEqual(dive);
    expect(mockRunDeepDive).toHaveBeenCalledWith(idea, "founder");
  });
});
