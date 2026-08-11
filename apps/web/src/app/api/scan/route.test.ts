import { beforeEach, describe, expect, it, vi } from "vitest";

// A rota puxa IA + DB via @stalo/server e o workspace via @/lib/workspace.
// Mockamos tudo — o alvo é o LIMITE: 4 scans por 2h por IP, fail-closed.
vi.mock("server-only", () => ({}));
vi.mock("@stalo/server", () => ({
  runScan: vi.fn(),
  saveScan: vi.fn(),
  checkRateLimit: vi.fn(),
}));
vi.mock("@/lib/workspace", () => ({
  getWorkspaceId: vi.fn(),
}));

import { POST } from "./route";
import { checkRateLimit, runScan, saveScan } from "@stalo/server";
import { getWorkspaceId } from "@/lib/workspace";

const mockCheck = vi.mocked(checkRateLimit);
const mockRunScan = vi.mocked(runScan);
const mockSaveScan = vi.mocked(saveScan);
const mockWid = vi.mocked(getWorkspaceId);

function req(): Request {
  return new Request("http://localhost/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "1.2.3.4" },
    body: JSON.stringify({ topics: ["IA"], days: null }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCheck.mockResolvedValue({ allowed: true, remaining: 1, retryAfterSeconds: 60 });
  mockRunScan.mockResolvedValue({ items: [], insights: [] });
  mockSaveScan.mockResolvedValue(undefined);
  mockWid.mockResolvedValue("wid-anon");
});

describe("POST /api/scan — limite de 4 scans por 2h", () => {
  it("dentro do limite passa e consome a chave de IP", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    // uma única chave: a de IP. A chave por cookie saiu — o cliente a controla.
    expect(mockCheck.mock.calls).toEqual([["rl:scan:1.2.3.4", 4, 7200]]);
    expect(mockSaveScan).toHaveBeenCalledWith("wid-anon", ["IA"], { items: [], insights: [] });
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
    mockCheck.mockRejectedValue(new Error("upstash fora"));
    const res = await POST(req());
    expect(res.status).toBe(503);
    expect(mockRunScan).not.toHaveBeenCalled();
    expect(mockSaveScan).not.toHaveBeenCalled();
  });
});
