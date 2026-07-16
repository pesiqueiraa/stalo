import { afterEach, describe, expect, it, vi } from "vitest";

// A rota usa Supabase (verifyOtp) e o destino pós-auth (que puxa DB). Mockamos
// os dois — aqui o alvo é o CONTRATO da rota: redirects certos em cada caso.
const { verifyOtp } = vi.hoisted(() => ({ verifyOtp: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServer: vi.fn(async () => ({ auth: { verifyOtp } })),
}));
vi.mock("@/lib/postAuthDest", () => ({
  postAuthDest: vi.fn(async () => "/radar"),
}));

import { GET } from "./route";

function req(qs: string): Request {
  return new Request(`http://localhost/auth/confirm${qs}`);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /auth/confirm — link de confirmação de e-mail", () => {
  it("sem token_hash → volta pro login com aviso, sem chamar o Supabase", async () => {
    const res = await GET(req(""));
    expect(res.headers.get("location")).toBe("http://localhost/login?error=confirm");
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("token inválido/expirado → volta pro login com aviso", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "Token expired" } });
    const res = await GET(req("?token_hash=abc&type=email"));
    expect(res.headers.get("location")).toBe("http://localhost/login?error=confirm");
  });

  it("token válido → segue pro destino pós-auth", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const res = await GET(req("?token_hash=abc&type=email"));
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "abc", type: "email" });
    expect(res.headers.get("location")).toBe("http://localhost/radar");
  });
});
