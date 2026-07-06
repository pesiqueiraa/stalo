import type { InsightType } from "@stalo/shared";
import { INSIGHT_COLORS } from "@/lib/graph";
import { diamondPath, innerGlyphPath } from "@/lib/shapes";

interface InsightGlyphProps {
  type: InsightType;
  size?: number;
}

// Versão estática (sem pulso/glow) da forma de insight do grafo — losango vazado
// + glifo do tipo — pra usar na legenda. Mesma matemática do GraphCanvas via lib/shapes.
export function InsightGlyph({ type, size = 18 }: InsightGlyphProps) {
  const color = INSIGHT_COLORS[type];
  const half = size / 2;
  const r = half - 1.5; // folga pra borda não vazar do viewBox
  return (
    <svg
      width={size}
      height={size}
      viewBox={`${-half} ${-half} ${size} ${size}`}
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d={diamondPath(r)}
        fill={color}
        fillOpacity={0.12}
        stroke={color}
        strokeWidth={1.6}
      />
      <path d={innerGlyphPath(type, r)} fill={color} fillOpacity={0.95} />
    </svg>
  );
}
