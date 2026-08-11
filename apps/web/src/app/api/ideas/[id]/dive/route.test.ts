import { beforeEach, describe, expect, it, vi } from "vitest";

// A rota puxa IA + DB via @stalo/server e o workspace via @/lib/workspace.
// Mockamos tudo — o alvo é o LIMITE: 20 dives por hora por IP, fail-closed.
vi.mock("server-only", () => ({}));
vi.mock("@stalo/server", () => ({
  getIdea: vi.fn(),
  getLens: vi.fn(),
  runDeepDive: vi.fn(),
  saveDeepDive: vi.fn(),
  checkRateLimit: vi.fn(),
}));
vi.mock("@/lib/workspace", () => ({
  getWorkspaceId: vi.fn(),
}));

import { POST } from "./route";
import { checkRateLimit, getIdea, runDeepDive } from "@stalo/server";
import { getWorkspaceId } from "@/lib/workspace";

const mockCheck = vi.mocked(checkRateLimit);
const mockGetIdea = vi.mocked(getIdea);
const mockRunDeepDive = vi.mocked(runDeepDive);
const mockWid = vi.mocked(getWorkspaceId);

function req(): Request {
  return new Request("http://localhost/api/ideas/idea-1/dive", {
    method: "POST",
    headers: { "x-forwarded-for": "1.2.3.4" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCheck.mockResolvedValue({ allowed: true, remaining: 19, retryAfterSeconds: 60 });
  mockGetIdea.mockResolvedValue({ id: "idea-1", deepDive: undefined } as never);
  mockWid.mockResolvedValue("wid-anon");
});

describe("POST /api/ideas/:id/dive — fail-closed", () => {
  it("contador fora → 503 e a IA não é chamada", async () => {
    // era fail-open. Com a infra do contador cega, deixar passar significava
    // gastar sem teto — o mesmo cenário que quebrou o /api/scan.
    mockCheck.mockRejectedValue(new Error("upstash fora"));
    const res = await POST(req(), { params: Promise.resolve({ id: "idea-1" }) });
    expect(res.status).toBe(503);
    expect(mockRunDeepDive).not.toHaveBeenCalled();
  });
});
