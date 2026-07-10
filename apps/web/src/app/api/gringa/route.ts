import { NextResponse } from "next/server";
import { getGringaFeed, runGringa, saveGringaFeed } from "@stalo/server";
import { enforceRateLimit } from "@/lib/rateLimit";

// GET /api/gringa — o feed "Na gringa" (o que se move lá fora antes de chegar ao
// BR). É UNIVERSAL: um cache global singleton, não workspace-scoped. Serve o
// cache direto quando fresco; regenera via LLM (runGringa) só quando velho/vazio,
// e mesmo aí protege o caminho caro com rate limit. A chave de IA nunca sai do
// servidor (regra 1). Degrada com elegância: se o refresh falhar/estourar o
// limite mas houver cache velho, devolve o velho em vez de erro.

// TTL: o feed muda devagar, então não vale regenerar a cada acesso.
const TTL_HOURS = 24;
const TTL_MS = TTL_HOURS * 3_600_000;
// refresh é raro (protegido pelo TTL), então o limite pode ser baixo — só evita
// que uma rajada de acessos com cache velho dispare N gerações de LLM em paralelo.
const GRINGA_REFRESH_LIMIT = { bucket: "gringa", limit: 6, windowSeconds: 3600 };

export async function GET(request: Request) {
  let cached: Awaited<ReturnType<typeof getGringaFeed>> = null;
  try {
    cached = await getGringaFeed();
  } catch (err) {
    // falha ao LER o cache não deve derrubar o feed: segue pro refresh (cached
    // fica null), que tenta gerar do zero.
    console.error("getGringaFeed failed", err);
  }

  // cache fresco: serve direto, sem tocar na IA.
  if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < TTL_MS) {
    return NextResponse.json({ items: cached.items, fetchedAt: cached.fetchedAt });
  }

  // precisa refresh (velho ou vazio): o rate limit protege SÓ o caminho de LLM.
  const limited = await enforceRateLimit(
    request,
    GRINGA_REFRESH_LIMIT.bucket,
    GRINGA_REFRESH_LIMIT.limit,
    GRINGA_REFRESH_LIMIT.windowSeconds,
  );
  if (limited) {
    // estourou o limite: melhor servir o cache velho do que um 429, se ele existe.
    if (cached) return NextResponse.json({ items: cached.items, fetchedAt: cached.fetchedAt });
    return limited;
  }

  try {
    const items = await runGringa();
    await saveGringaFeed(items);
    return NextResponse.json({ items, fetchedAt: new Date().toISOString() });
  } catch (err) {
    // o erro completo (causa do provider/DB) fica só no log do servidor; o
    // usuário nunca recebe internals vazados. Se há cache velho, degrada pra ele.
    console.error("gringa refresh failed", err);
    if (cached) return NextResponse.json({ items: cached.items, fetchedAt: cached.fetchedAt });
    return NextResponse.json(
      { error: "Não consegui carregar o feed da gringa agora." },
      { status: 502 },
    );
  }
}
