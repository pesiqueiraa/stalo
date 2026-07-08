import type { NewsItem } from "@stalo/shared";
import { formatShortDate } from "@/lib/ui";

// Timestamp do dia (meia-noite local) de um published_at, ou null se inválido.
function dayTime(iso: string): number | null {
  if (!iso) return null;
  const t = new Date(`${iso}T00:00:00`).getTime();
  return Number.isNaN(t) ? null : t;
}

const DAY = 86_400_000;

// Largura de janela do histograma, escolhida pelo span pra dar 3–8 barras
// legíveis: até ~3 semanas por dia, até ~3 meses por semana, acima por mês.
function pickBucket(spanDays: number): { ms: number; label: string } {
  if (spanDays <= 21) return { ms: DAY, label: "por dia" };
  if (spanDays <= 92) return { ms: 7 * DAY, label: "por semana" };
  return { ms: 30 * DAY, label: "por mês" };
}

// Gráfico de COBERTURA ao longo do tempo: um histograma das notícias que
// sustentam a ideia, binadas por período (published_at). Mostra o FORMATO da
// cobertura (pico isolado, onda, gotejar) — puro cliente, zero IA.
// Importante: é a atividade das notícias DESTE conjunto, não uma "tendência"
// real (isso exigiria histórico entre scans — ver notas.md/roadmap.md).
export function CoverageChart({ items }: { items: NewsItem[] }) {
  const dated = items
    .map((it) => dayTime(it.publishedAt))
    .filter((t): t is number => t !== null)
    .sort((a, b) => a - b);
  if (dated.length === 0) return null;

  const min = dated[0];
  const max = dated[dated.length - 1];
  const spanDays = Math.round((max - min) / DAY);
  const bucket = pickBucket(spanDays);

  // conta notícias por balde (índice a partir do min); nº de baldes cobre todo o span
  const bucketCount = Math.max(1, Math.floor((max - min) / bucket.ms) + 1);
  const counts = new Array(bucketCount).fill(0) as number[];
  for (const t of dated) counts[Math.floor((t - min) / bucket.ms)]++;
  const peak = Math.max(...counts);

  const caption =
    dated.length === 1
      ? "1 notícia que sustenta esta ideia"
      : `${dated.length} notícias que sustentam esta ideia · ${bucket.label}`;

  return (
    <div className="coverage" role="img" aria-label={`Cobertura ao longo do tempo: ${caption}`}>
      <div className="coverage-bars">
        {counts.map((c, i) => (
          <div className="coverage-col" key={i} title={`${c} ${c === 1 ? "notícia" : "notícias"}`}>
            <div
              className="coverage-bar"
              style={{ height: peak > 0 ? `${(c / peak) * 100}%` : "0%" }}
            />
          </div>
        ))}
      </div>
      <div className="coverage-meta">
        <span>{formatShortDate(items.find((it) => dayTime(it.publishedAt) === min)!.publishedAt)}</span>
        <span className="coverage-caption">{caption}</span>
        <span>
          {min === max
            ? ""
            : formatShortDate(items.find((it) => dayTime(it.publishedAt) === max)!.publishedAt)}
        </span>
      </div>
    </div>
  );
}
