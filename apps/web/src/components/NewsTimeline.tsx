import type { NewsNode } from "@stalo/shared";
import { formatShortDate } from "@/lib/ui";

// Timestamp do dia de publicação, ou null se a notícia veio sem data válida.
function dayTime(iso: string): number | null {
  if (!iso) return null;
  const t = new Date(`${iso}T00:00:00`).getTime();
  return Number.isNaN(t) ? null : t;
}

const DAY_MS = 86_400_000;
// deslocamentos verticais para notícias publicadas no mesmo dia, pra nenhum
// ponto esconder outro (alterna acima/abaixo do eixo)
const STACK_OFFSETS = [0, -6, 6, -11, 11];

// Mini-timeline das notícias relacionadas a um insight: pontos no eixo do
// tempo (published_at), coloridos por tema. O objetivo é ver de relance se o
// padrão é um evento isolado ou uma sequência ao longo de dias/semanas.
// HTML+CSS puro (posições em %), sem biblioteca de gráfico.
export function NewsTimeline({ items }: { items: NewsNode[] }) {
  const dated = items
    .map((item) => ({ item, t: dayTime(item.publishedAt) }))
    .filter((d): d is { item: NewsNode; t: number } => d.t !== null);
  if (dated.length === 0) return null;

  let first = dated[0];
  let last = dated[0];
  for (const d of dated) {
    if (d.t < first.t) first = d;
    if (d.t > last.t) last = d;
  }
  const min = first.t;
  const span = last.t - min;
  const spanDays = Math.round(span / DAY_MS);

  // índice dentro do grupo do mesmo dia, pra empilhar pontos coincidentes
  const seenPerDay = new Map<number, number>();
  const dots = dated.map(({ item, t }) => {
    const stack = seenPerDay.get(t) ?? 0;
    seenPerDay.set(t, stack + 1);
    return {
      id: item.id,
      x: span === 0 ? 50 : ((t - min) / span) * 100,
      dy: STACK_OFFSETS[Math.min(stack, STACK_OFFSETS.length - 1)],
      color: item.color,
      label: `${item.title} · ${formatShortDate(item.publishedAt)}`,
    };
  });

  const caption =
    dated.length === 1
      ? "notícia única"
      : spanDays === 0
        ? `${dated.length} notícias no mesmo dia`
        : `${dated.length} notícias em ${spanDays} ${spanDays === 1 ? "dia" : "dias"}`;

  return (
    <div className="mini-timeline" role="img" aria-label={`Linha do tempo: ${caption}`}>
      <div className="mini-timeline-track">
        <span className="mini-timeline-axis" aria-hidden="true" />
        {dots.map((dot) => (
          <span
            key={dot.id}
            className="mini-timeline-dot"
            style={{
              left: `${dot.x}%`,
              background: dot.color,
              transform: `translate(-50%, calc(-50% + ${dot.dy}px))`,
            }}
            title={dot.label}
          />
        ))}
      </div>
      <div className="mini-timeline-meta">
        <span>{formatShortDate(first.item.publishedAt)}</span>
        <span className="mini-timeline-caption">{caption}</span>
        <span>{span === 0 ? "" : formatShortDate(last.item.publishedAt)}</span>
      </div>
    </div>
  );
}
