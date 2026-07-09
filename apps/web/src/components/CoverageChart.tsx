import type { NewsItem } from "@stalo/shared";
import { formatShortDate } from "@/lib/ui";
import { binCoverage } from "@/lib/coverage";

// Gráfico de COBERTURA ao longo do tempo: histograma das notícias que sustentam
// a ideia, binadas por período (published_at). O binning (lógica pura) vive em
// lib/coverage.ts; aqui é só a apresentação. Puro cliente, zero IA.
export function CoverageChart({ items }: { items: NewsItem[] }) {
  const cov = binCoverage(items);
  if (!cov) return null;

  const peak = Math.max(...cov.bars);
  const caption =
    cov.total === 1
      ? "1 notícia que sustenta esta ideia"
      : `${cov.total} notícias que sustentam esta ideia · ${cov.bucketLabel}`;

  return (
    <div className="coverage" role="img" aria-label={`Cobertura ao longo do tempo: ${caption}`}>
      <div className="coverage-bars">
        {cov.bars.map((c, i) => (
          <div className="coverage-col" key={i} title={`${c} ${c === 1 ? "notícia" : "notícias"}`}>
            <div
              className="coverage-bar"
              style={{ height: peak > 0 ? `${(c / peak) * 100}%` : "0%" }}
            />
          </div>
        ))}
      </div>
      <div className="coverage-meta">
        <span>{formatShortDate(cov.firstIso)}</span>
        <span className="coverage-caption">{caption}</span>
        <span>{cov.firstIso === cov.lastIso ? "" : formatShortDate(cov.lastIso)}</span>
      </div>
    </div>
  );
}
