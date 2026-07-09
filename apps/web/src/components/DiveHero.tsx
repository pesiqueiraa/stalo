import type { InsightType } from "@stalo/shared";
import { INSIGHT_COLORS } from "@/lib/graph";

// Masthead animado do mergulho, um por tipo de insight — o elemento que "chama
// atenção" no topo. Puro SVG+CSS (animações em globals.css, .dive-hero-*).
// Decorativo: dá o tom; o dado real vem nas seções abaixo (cobertura, etc).
export function DiveHero({ type }: { type: InsightType }) {
  const color = INSIGHT_COLORS[type];
  return (
    <div className={`dive-hero dive-hero-${type}`} aria-hidden="true">
      {type === "tendencia" && (
        // a curva que se desenha subindo + o pulso "você está aqui"
        <svg viewBox="0 0 640 150" preserveAspectRatio="none" width="100%" height="120">
          <g stroke="rgba(255,255,255,0.05)">
            <line x1="0" y1="40" x2="640" y2="40" />
            <line x1="0" y1="80" x2="640" y2="80" />
            <line x1="0" y1="120" x2="640" y2="120" />
          </g>
          <path
            className="dive-hero-trend"
            d="M20,132 C160,126 250,96 340,66 C430,36 520,26 620,20"
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle className="dive-hero-pulse" cx="340" cy="66" r="4.5" fill={color} />
        </svg>
      )}

      {type === "gap" && (
        // os dois setores nas margens + a ponte tracejada tentando cruzar o vão
        <svg viewBox="0 0 640 150" width="100%" height="120">
          <rect x="30" y="45" width="120" height="60" rx="10" fill={color} fillOpacity="0.14" stroke={color} strokeWidth="1.5" />
          <rect x="490" y="45" width="120" height="60" rx="10" fill={color} fillOpacity="0.14" stroke={color} strokeWidth="1.5" />
          <rect
            className="dive-hero-void"
            x="175"
            y="38"
            width="290"
            height="74"
            rx="8"
            fill="none"
            stroke={color}
            strokeOpacity="0.4"
            strokeWidth="1"
            strokeDasharray="3 5"
          />
          <path
            className="dive-hero-bridge"
            d="M150,75 L490,75"
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      )}

      {type === "oportunidade" && (
        // a cunha avançando pelos anéis do radar até o alvo (beachhead) pulsando
        <svg viewBox="0 0 640 150" width="100%" height="120">
          <g transform="translate(430,75)">
            <circle r="66" fill="none" stroke={color} strokeOpacity="0.12" />
            <circle r="46" fill="none" stroke={color} strokeOpacity="0.18" />
            <circle r="26" fill="none" stroke={color} strokeOpacity="0.28" />
            <circle className="dive-hero-pulse" r="5.5" fill={color} />
            <polygon
              className="dive-hero-wedge"
              points="-360,-16 -40,0 -360,16"
              fill={color}
              fillOpacity="0.85"
            />
          </g>
        </svg>
      )}
    </div>
  );
}
