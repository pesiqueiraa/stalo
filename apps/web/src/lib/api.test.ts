import { afterEach, describe, expect, it, vi } from "vitest";
import { requestScan, SignupRequiredError } from "./api";

function stubFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestScan — erros do gate", () => {
  it("401 signup_required vira SignupRequiredError com a mensagem do servidor", async () => {
    stubFetch(401, { error: "Seu scan grátis já foi usado.", code: "signup_required" });
    const err = await requestScan(["IA"], null).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SignupRequiredError);
    expect((err as Error).message).toBe("Seu scan grátis já foi usado.");
  });

  it("outros erros seguem como Error genérico (não SignupRequiredError)", async () => {
    stubFetch(500, { error: "boom" });
    const err = await requestScan(["IA"], null).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(SignupRequiredError);
    expect((err as Error).message).toBe("boom");
  });
});
