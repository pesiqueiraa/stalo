// Binning da COBERTURA ao longo do tempo — lógica PURA (sem React), separada do
// CoverageChart pra ser testável. Bina as notícias que sustentam uma ideia por
// período (published_at), pra mostrar o FORMATO da cobertura (pico isolado,
// onda, gotejar). É a atividade DESTE conjunto, não tendência real (isso exigiria
// histórico entre scans — ver notas.md/roadmap.md).

const DAY = 86_400_000;

// Timestamp do dia (meia-noite local) de um published_at, ou null se inválido.
export function dayTime(iso: string): number | null {
  if (!iso) return null;
  const t = new Date(`${iso}T00:00:00`).getTime();
  return Number.isNaN(t) ? null : t;
}

// Largura de janela do histograma, escolhida pelo span pra dar 3–8 barras
// legíveis: até ~3 semanas por dia, até ~3 meses por semana, acima por mês.
function pickBucket(spanDays: number): { ms: number; label: string } {
  if (spanDays <= 21) return { ms: DAY, label: "por dia" };
  if (spanDays <= 92) return { ms: 7 * DAY, label: "por semana" };
  return { ms: 30 * DAY, label: "por mês" };
}

export interface Coverage {
  bars: number[]; // contagem de notícias por balde, do mais antigo ao mais recente
  total: number; // total de notícias com data válida
  bucketLabel: string; // "por dia" | "por semana" | "por mês"
  firstIso: string; // published_at da notícia mais antiga (data original)
  lastIso: string; // published_at da mais recente
  spanDays: number;
}

// Bina as notícias por período. Retorna null se nenhuma tem data válida (o
// gráfico não é renderizado nesse caso). Notícias sem data são ignoradas.
export function binCoverage(items: { publishedAt: string }[]): Coverage | null {
  const dated = items
    .map((it) => ({ iso: it.publishedAt, t: dayTime(it.publishedAt) }))
    .filter((d): d is { iso: string; t: number } => d.t !== null)
    .sort((a, b) => a.t - b.t);
  if (dated.length === 0) return null;

  const min = dated[0].t;
  const max = dated[dated.length - 1].t;
  const spanDays = Math.round((max - min) / DAY);
  const bucket = pickBucket(spanDays);

  const bucketCount = Math.max(1, Math.floor((max - min) / bucket.ms) + 1);
  const bars = new Array(bucketCount).fill(0) as number[];
  for (const d of dated) bars[Math.floor((d.t - min) / bucket.ms)]++;

  return {
    bars,
    total: dated.length,
    bucketLabel: bucket.label,
    firstIso: dated[0].iso,
    lastIso: dated[dated.length - 1].iso,
    spanDays,
  };
}
