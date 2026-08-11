import { beforeEach, describe, expect, it, vi } from "vitest";

const checkRateLimit = vi.fn();
vi.mock("@stalo/server", () => ({ checkRateLimit: (...a: unknown[]) => checkRateLimit(...a) }));

const { enforceRateLimit, SCAN_LIMIT } = await import("./rateLimit");

function req(ip = "1.2.3.4"): Request {
  return new Request("https://stalo.dev/api/scan", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
}

describe("enforceRateLimit", () => {
  beforeEach(() => {
    checkRateLimit.mockReset();
  });

  it("deixa passar quando está dentro do limite", async () => {
    checkRateLimit.mockResolvedValue({ allowed: true, remaining: 3, retryAfterSeconds: 0 });
    expect(await enforceRateLimit(req(), "scan", 4, 7200)).toBeNull();
  });

  it("recusa com 429 e Retry-After quando estoura", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 1800 });
    const res = await enforceRateLimit(req(), "scan", 4, 7200);
    expect(res?.status).toBe(429);
    expect(res?.headers.get("Retry-After")).toBe("1800");
  });

  it("usa o primeiro IP do x-forwarded-for na chave", async () => {
    checkRateLimit.mockResolvedValue({ allowed: true, remaining: 3, retryAfterSeconds: 0 });
    const r = new Request("https://stalo.dev/api/scan", {
      method: "POST",
      headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" },
    });
    await enforceRateLimit(r, "scan", 4, 7200);
    expect(checkRateLimit).toHaveBeenCalledWith("rl:scan:9.9.9.9", 4, 7200);
  });

  it("FAIL-CLOSED: recusa com 503 quando o contador cai e a rota é cara", async () => {
    checkRateLimit.mockRejectedValue(new Error("upstash fora"));
    const res = await enforceRateLimit(req(), "scan", 4, 7200, { failClosed: true });
    expect(res?.status).toBe(503);
    expect(await res?.json()).toEqual({
      error: "O controle de uso está indisponível agora. Tente de novo em alguns minutos.",
    });
  });

  it("FAIL-OPEN: deixa passar quando o contador cai e a rota é barata", async () => {
    checkRateLimit.mockRejectedValue(new Error("upstash fora"));
    expect(await enforceRateLimit(req(), "algo-barato", 20, 3600)).toBeNull();
  });

  it("usa a mensagem específica da rota quando ela é passada", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 900 });
    const res = await enforceRateLimit(req(), "scan", 4, 7200, {
      message: "Você usou seus 4 scans desta janela de 2 horas. Volte daqui a pouco.",
    });
    const body = (await res?.json()) as { error: string };
    expect(body.error).toContain("4 scans");
  });

  it("o limite do scan é 4 por 2 horas", () => {
    expect(SCAN_LIMIT).toEqual({ bucket: "scan", limit: 4, windowSeconds: 7200 });
  });
});
