"use client";

import { computePriority, type EnterpriseRadar } from "@/lib/enterpriseMock";

interface ScopeStatsProps {
  radar: EnterpriseRadar;
}

// Fileira de métricas derivadas do radar ativo — dá ao olho algo substancial
// pra ancorar antes de entrar nos detalhes de cada insight. "Alta prioridade"
// vem primeiro depois do total: é a resposta direta a "o que eu olho agora?"
// (ver heurística em lib/enterpriseMock).
export function ScopeStats({ radar }: ScopeStatsProps) {
  const total = radar.insights.length;
  const highPriority = radar.insights.filter(
    (i) => computePriority(i, radar).level === "alta",
  ).length;
  const threats = radar.insights.filter((i) => i.threat).length;
  const avgRecurrence = total > 0 ? radar.insights.reduce((sum, i) => sum + i.recurrence, 0) / total : 0;

  const items: { label: string; value: string; warn?: boolean }[] = [
    { label: "Sinais ativos", value: String(total) },
    { label: "Alta prioridade", value: String(highPriority), warn: highPriority > 0 },
    { label: "Ameaças", value: String(threats), warn: threats > 0 },
    { label: "Recorrência média", value: `${avgRecurrence.toFixed(1)}x` },
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
