import { beforeEach, describe, expect, it, vi } from "vitest";

// A rota puxa IA + DB via @stalo/server e sessão via @/lib/workspace. Mockamos
// tudo — o alvo é o GATE: logado passa, anônimo tem 1 brinde, fail-open vale.
vi.mock("server-only", () => ({}));
vi.mock("@stalo/server", () => ({
  runScan: vi.fn(),
  saveScan: vi.fn(),
  checkRateLimit: vi.fn(),
}));
vi.mock("@/lib/workspace", () => ({
  getAuthUserId: vi.fn(),
  getWorkspaceId: vi.fn(),
}));

import { POST } from "./route";
import { checkRateLimit, runScan, saveScan } from "@stalo/server";
import { getAuthUserId, getWorkspaceId } from "@/lib/workspace";

const mockCheck = vi.mocked(checkRateLimit);
const mockRunScan = vi.mocked(runScan);
const mockSaveScan = vi.mocked(saveScan);
const mockAuthUser = vi.mocked(getAuthUserId);
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
  mockAuthUser.mockResolvedValue(null);
  mockWid.mockResolvedValue("wid-anon");
});

describe("POST /api/scan — gate do scan grátis", () => {
  it("anônimo no 1º scan passa e consome as duas chaves do brinde", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    const keys = mockCheck.mock.calls.map(([key]) => key);
    expect(keys).toContain("free-scan:ip:1.2.3.4");
    expect(keys).toContain("free-scan:wid:wid-anon");
    expect(mockSaveScan).toHaveBeenCalledWith("wid-anon", ["IA"], { items: [], insights: [] });
  });

  it("anônimo com brinde gasto → 401 signup_required, sem gastar OpenAI", async () => {
    mockCheck.mockImplementation(async (key: string) => ({
      allowed: !key.startsWith("free-scan:"),
      remaining: 0,
      retryAfterSeconds: 60,
    }));
    const res = await POST(req());
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("signup_required");
    expect(mockRunScan).not.toHaveBeenCalled();
  });

  it("logado não passa pelo gate do brinde", async () => {
    mockAuthUser.mockResolvedValue("user-1");
    const res = await POST(req());
    expect(res.status).toBe(200);
    const keys = mockCheck.mock.calls.map(([key]) => key);
    expect(keys.some((k) => k.startsWith("free-scan:"))).toBe(false);
    expect(mockSaveScan).toHaveBeenCalledWith("user-1", ["IA"], { items: [], insights: [] });
  });

  it("infra de rate limit fora → fail-open (scan segue)", async () => {
    mockCheck.mockRejectedValue(new Error("db down"));
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(mockRunScan).toHaveBeenCalled();
  });

  it("limite por IP estourado continua devolvendo 429 (comportamento existente)", async () => {
    mockCheck.mockImplementation(async (key: string) => ({
      allowed: !key.startsWith("scan:"),
      remaining: 0,
      retryAfterSeconds: 60,
    }));
    const res = await POST(req());
    expect(res.status).toBe(429);
    expect(mockRunScan).not.toHaveBeenCalled();
  });
});
