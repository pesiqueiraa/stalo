"use client";

import type { EnterpriseRadar } from "@/lib/enterpriseMock";

interface ScopeStatsProps {
  radar: EnterpriseRadar;
}

// Fileira de métricas derivadas do radar ativo — dá ao olho algo substancial
// pra ancorar antes de entrar nos detalhes de cada insight, e traduz a
// recorrência/impacto (ver lib/enterpriseMock) em números direto.
export function ScopeStats({ radar }: ScopeStatsProps) {
  const total = radar.insights.length;
  const threats = radar.insights.filter((i) => i.tags.includes("ameaça")).length;
  const avgRecurrence = total > 0 ? radar.insights.reduce((sum, i) => sum + i.recurrence, 0) / total : 0;
  const withImpact = radar.insights.filter((i) => Object.values(i.impact).some(Boolean)).length;

  const items: { label: string; value: string; warn?: boolean }[] = [
    { label: "Sinais ativos", value: String(total) },
    { label: "Ameaças", value: String(threats), warn: threats > 0 },
    { label: "Recorrência média", value: `${avgRecurrence.toFixed(1)}x` },
    { label: "Com impacto de negócio", value: `${withImpact}/${total}` },
    { label: "Temas monitorados", value: String(radar.topics.length) },
  ];

  return (
    <div className="ent-stats">
      {items.map((item) => (
        <div key={item.label} className={`ent-stat${item.warn ? " warn" : ""}`}>
          <span className="ent-stat-value">{item.value}</span>
          <span className="ent-stat-label">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
