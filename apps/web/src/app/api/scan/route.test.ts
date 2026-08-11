import { beforeEach, describe, expect, it, vi } from "vitest";

// A rota puxa IA + DB via @stalo/server e o workspace via @/lib/workspace.
// Mockamos tudo — o alvo é o LIMITE: 4 scans por 2h por IP+cookie, fail-open.
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
  it("dentro do limite passa e consome as chaves de IP e de workspace", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(mockCheck.mock.calls).toContainEqual(["scan:ip:1.2.3.4", 4, 7200]);
    expect(mockCheck.mock.calls).toContainEqual(["scan:wid:wid-anon", 4, 7200]);
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

  it("basta UMA das chaves estourar para bloquear (cookie novo não renova)", async () => {
    mockCheck.mockImplementation(async (key: string) => ({
      allowed: !key.startsWith("scan:ip:"),
      remaining: 0,
      retryAfterSeconds: 900,
    }));
    const res = await POST(req());
    expect(res.status).toBe(429);
    expect(mockRunScan).not.toHaveBeenCalled();
  });

  it("infra de rate limit fora → fail-open (scan segue)", async () => {
    mockCheck.mockRejectedValue(new Error("db down"));
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(mockRunScan).toHaveBeenCalled();
  });
});
