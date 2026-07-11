import { afterEach, describe, expect, it, vi } from "vitest";

// A rota puxa @stalo/server (server-only + DB). Aqui exercitamos a validação do
// `id` e o caminho de confirmação — o UPDATE real no banco NÃO roda em teste.
vi.mock("server-only", () => ({}));
vi.mock("@stalo/server", () => ({ unsubscribe: vi.fn(async () => undefined) }));

import { unsubscribe } from "@stalo/server";
import { GET } from "./route";

const unsubscribeMock = vi.mocked(unsubscribe);

function req(query = ""): Request {
  return new Request(`http://localhost/api/newsletter/unsubscribe${query}`, { method: "GET" });
}

afterEach(() => vi.clearAllMocks());

describe("GET /api/newsletter/unsubscribe", () => {
  it("400 (página de erro) quando falta o id", async () => {
    const res = await GET(req());
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(unsubscribeMock).not.toHaveBeenCalled();
  });

  it("400 quando o id vem vazio", async () => {
    const res = await GET(req("?id="));
    expect(res.status).toBe(400);
    expect(unsubscribeMock).not.toHaveBeenCalled();
  });

  it("200 (página de confirmação) e chama unsubscribe com o id", async () => {
    const res = await GET(req("?id=abc-123"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(unsubscribeMock).toHaveBeenCalledWith("abc-123");
  });
});
