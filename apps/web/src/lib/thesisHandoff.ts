// Handoff da tese do onboarding pro radar: pré-preenchimento OTIMISTA. A tese
// escrita no onboarding é guardada no localStorage e consumida UMA vez no radar
// (pré-preenche o compositor e dispara o primeiro veredito na chegada). Desde que
// o veredito passou a ser persistido no backend, a fonte DURÁVEL da tese é o
// último veredito salvo (restaurado via GET /api/verdict/latest) — este handoff é
// só a ponte imediata onboarding→radar, antes de o banco responder. localStorage
// em vez de query param pra não poluir a URL nem exigir encode de texto livre.

const KEY = "stalo:pending-thesis";

export interface PendingThesis {
  build: string;
  forWhom: string;
}

export function savePendingThesis(t: PendingThesis): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    // localStorage indisponível (aba privada/quota): o radar só não pré-preenche
  }
}

function readAndClear(): PendingThesis | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    localStorage.removeItem(KEY);
    const parsed = JSON.parse(raw) as Partial<PendingThesis>;
    if (typeof parsed.build !== "string" || typeof parsed.forWhom !== "string") return null;
    return { build: parsed.build, forWhom: parsed.forWhom };
  } catch {
    return null;
  }
}

// Memoizado por carga de página: a 1ª chamada lê e LIMPA o localStorage; as
// seguintes devolvem o MESMO valor. Sem isso, o double-invoke de effects do
// StrictMode (dev) fazia a 2ª execução — a que sobrevive — ler null (a 1ª já
// tinha limpado), e o veredito não abria. Um refresh do radar reinicia o módulo
// e o localStorage já está vazio, então não re-dispara.
let cached: { value: PendingThesis | null } | undefined;

export function takePendingThesis(): PendingThesis | null {
  if (cached === undefined) cached = { value: readAndClear() };
  return cached.value;
}
