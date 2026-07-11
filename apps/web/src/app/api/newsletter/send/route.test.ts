import { afterEach, describe, expect, it, vi } from "vitest";

// A rota puxa @stalo/server (server-only + IA + DB). Aqui exercitamos a PROTEÇÃO
// fail-closed (401) — o envio real via Resend NÃO roda em teste —, então
// isolamos as dependências pesadas com mocks.
vi.mock("server-only", () => ({}));
vi.mock("@stalo/server", () => ({
  getActiveSubscribers: vi.fn(async () => []),
  assemble: vi.fn(),
  renderBoletim: vi.fn(() => "<html>boletim</html>"),
  sendBoletim: vi.fn(async () => ({ id: "sent-id" })),
}));

import { GET } from "./route";

function req(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/newsletter/send", { method: "GET", headers });
}

afterEach(() => {
  delete process.env.CRON_SECRET;
  vi.clearAllMocks();
});

describe("GET /api/newsletter/send — proteção do cron", () => {
  it("401 quando CRON_SECRET não está configurada (fail-closed)", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req({ authorization: "Bearer qualquer" }));
    expect(res.status).toBe(401);
  });

  it("401 quando o Bearer não bate", async () => {
    process.env.CRON_SECRET = "certo";
    const res = await GET(req({ authorization: "Bearer errado" }));
    expect(res.status).toBe(401);
  });

  it("401 quando falta o header Authorization", async () => {
    process.env.CRON_SECRET = "certo";
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("passa da proteção com o Bearer certo e devolve o resumo do lote", async () => {
    process.env.CRON_SECRET = "certo";
    const res = await GET(req({ authorization: "Bearer certo" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { sent: number; failed: number; total: number };
    expect(data).toEqual({ sent: 0, failed: 0, total: 0 });
  });
});
