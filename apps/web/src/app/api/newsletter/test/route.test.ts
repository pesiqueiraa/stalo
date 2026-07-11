import { afterEach, describe, expect, it, vi } from "vitest";

// A rota puxa @stalo/server (server-only + IA + DB) e @/lib/rateLimit. Aqui só
// exercitamos a PROTEÇÃO (401) — o envio real via Resend NÃO roda em teste —,
// então isolamos as dependências pesadas com mocks.
vi.mock("server-only", () => ({}));
vi.mock("@stalo/server", () => ({
  assemble: vi.fn(),
  renderBoletim: vi.fn(() => "<html>boletim</html>"),
  sampleEdition: vi.fn(() => ({ weekStart: "2026-07-06", sectors: [], sections: [] })),
  sendBoletim: vi.fn(async () => ({ id: "sent-id" })),
}));
vi.mock("@/lib/rateLimit", () => ({ enforceRateLimit: vi.fn(async () => null) }));

import { POST } from "./route";

function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/newsletter/test", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  delete process.env.NEWSLETTER_ADMIN_SECRET;
  vi.clearAllMocks();
});

describe("POST /api/newsletter/test — proteção", () => {
  it("401 quando o segredo de admin NÃO está configurado (fail-closed)", async () => {
    delete process.env.NEWSLETTER_ADMIN_SECRET;
    const res = await POST(req({ email: "pedro@example.com", secret: "qualquer" }));
    expect(res.status).toBe(401);
  });

  it("401 quando o segredo enviado não bate", async () => {
    process.env.NEWSLETTER_ADMIN_SECRET = "certo";
    const res = await POST(req({ email: "pedro@example.com", secret: "errado" }));
    expect(res.status).toBe(401);
  });

  it("401 também quando o segredo vem no header e não bate", async () => {
    process.env.NEWSLETTER_ADMIN_SECRET = "certo";
    const res = await POST(
      req({ email: "pedro@example.com" }, { "x-admin-secret": "errado" }),
    );
    expect(res.status).toBe(401);
  });

  it("passa da proteção com o segredo certo (não é mais 401)", async () => {
    process.env.NEWSLETTER_ADMIN_SECRET = "certo";
    const res = await POST(
      req({ email: "pedro@example.com", sample: true }, { "x-admin-secret": "certo" }),
    );
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; id: string };
    expect(data.ok).toBe(true);
    expect(data.id).toBe("sent-id");
  });
});
