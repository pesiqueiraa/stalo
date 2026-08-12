import { beforeEach, describe, expect, it, vi } from "vitest";

// A rota puxa IA via @stalo/server. Mockamos tudo — o alvo é o LIMITE: 4
// scans por 2h por IP, fail-closed.
vi.mock("server-only", () => ({}));
vi.mock("@stalo/server", () => ({
  runScan: vi.fn(),
  checkRateLimit: vi.fn(),
}));

import { POST } from "./route";
import { checkRateLimit, runScan } from "@stalo/server";

const mockCheck = vi.mocked(checkRateLimit);
const mockRunScan = vi.mocked(runScan);

function req(body: unknown = { topics: ["IA"], days: null }): Request {
  return new Request("http://localhost/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "1.2.3.4" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCheck.mockResolvedValue({ allowed: true, remaining: 1, retryAfterSeconds: 60 });
  mockRunScan.mockResolvedValue({ items: [], insights: [] });
});

describe("POST /api/scan — limite de 4 scans por 2h", () => {
  it("dentro do limite passa e devolve o resultado do runScan", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    // uma única chave: a de IP. A chave por cookie saiu — o cliente a controla.
    expect(mockCheck.mock.calls).toEqual([["rl:scan:1.2.3.4", 4, 7200]]);
    const body = (await res.json()) as unknown;
    expect(body).toEqual({ items: [], insights: [] });
  });

  it("limite estourado → 429 com Retry-After, sem gastar OpenAI", async () => {
    mockCheck.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 1800 });
    const res = await POST(req());
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("1800");
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("4 scans");
    expect(mockRunScan).not.toHaveBeenCalled();
  });

  it("contador fora → FAIL-CLOSED: 503 e a OpenAI não é chamada", async () => {
    // era fail-open. Com a infra do contador cega, deixar passar significava
    // gastar sem teto — foi o que aconteceu quando o Supabase caiu.
    mockCheck.mockRejectedValue(new Error("contador fora"));
    const res = await POST(req());
    expect(res.status).toBe(503);
    expect(mockRunScan).not.toHaveBeenCalled();
  });
});

describe("POST /api/scan — teto de entrada (MAX_TOPICS/tamanho por tema)", () => {
  // MAX_TOPICS foi para o cliente (@stalo/shared) — a UI recusa o 6º tema,
  // mas o cliente é entrada não confiável. Sem checar de novo aqui, nada
  // impede um POST direto com temas demais ou um tema gigante indo pro prompt
  // do Coletor (packages/server/src/scanPrompt.ts: `topics.join(", ")`).
  it("temas demais → 400, sem rate limit nem runScan", async () => {
    const topics = ["a", "b", "c", "d", "e", "f"]; // MAX_TOPICS é 5
    const res = await POST(req({ topics, days: null }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBeTruthy();
    expect(mockCheck).not.toHaveBeenCalled();
    expect(mockRunScan).not.toHaveBeenCalled();
  });

  it("tema gigante → 400, sem rate limit nem runScan", async () => {
    const topics = ["x".repeat(101)];
    const res = await POST(req({ topics, days: null }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBeTruthy();
    expect(mockCheck).not.toHaveBeenCalled();
    expect(mockRunScan).not.toHaveBeenCalled();
  });
});
