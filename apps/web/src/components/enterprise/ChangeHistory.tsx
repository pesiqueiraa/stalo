"use client";

import {
  DELTA_KIND_INFO,
  MOCK_WEEKLY_DELTAS,
  type DeltaKind,
  type EnterpriseRadar,
  type WeeklySnapshot,
} from "@/lib/enterpriseMock";

const KIND_ORDER: DeltaKind[] = ["subiu", "novo", "reforcado", "esfriou"];

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function countsFor(week: WeeklySnapshot): { kind: DeltaKind; count: number }[] {
  return KIND_ORDER.map((kind) => ({
    kind,
    count: week.entries.filter((e) => e.kind === kind).length,
  })).filter((c) => c.count > 0);
}

// P0 do tier enterprise: detecção de mudança. Cada semana é um snapshot e a
// página mostra o delta entre elas — o que entrou, o que se confirmou, o que
// subiu de prioridade e o que esfriou. É o que separa "scan sob demanda"
// (qualquer ferramenta grátis faz) de monitoramento de verdade.
export function ChangeHistory({ radar }: { radar: EnterpriseRadar }) {
  const weeks = MOCK_WEEKLY_DELTAS[radar.id] ?? [];
  const runs = [...radar.scans].reverse(); // mais recente primeiro

  return (
    <div className="ent-history">
      {weeks.map((week, i) => (
        <section key={week.id} className={`ent-week${i === 0 ? " latest" : ""}`}>
          <header className="ent-week-head">
            <span className="ent-week-label">{week.label}</span>
            <span className="ent-week-scans">{week.scans} varreduras</span>
            <span className="ent-week-counts">
              {countsFor(week).map(({ kind, count }) => (
                <span key={kind} className="ent-delta-kind" style={{ color: DELTA_KIND_INFO[kind].color }}>
                  {count} {DELTA_KIND_INFO[kind].label.toLowerCase()}
                </span>
              ))}
            </span>
          </header>
          <ul className="ent-delta-list">
            {week.entries.map((entry, j) => (
              <li key={`${week.id}-${j}`} className="ent-delta-row">
                <span className="ent-delta-kind" style={{ color: DELTA_KIND_INFO[entry.kind].color }}>
                  {DELTA_KIND_INFO[entry.kind].label}
                </span>
                <span className="ent-delta-body">
                  <span className={`ent-delta-title${entry.kind === "esfriou" ? " gone" : ""}`}>{entry.title}</span>
                  <span className="ent-delta-note">{entry.note}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="ent-runs ent-hud-panel">
        <header className="ent-runs-head">Varreduras recentes</header>
        <table className="ent-runs-table">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Novos</th>
              <th>Reforçados</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td>{formatWhen(run.at)}</td>
                <td className={run.newInsights > 0 ? "hot" : ""}>
                  {run.newInsights > 0 ? `+${run.newInsights}` : "—"}
                </td>
                <td>{run.reinforced > 0 ? run.reinforced : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="ent-runs-note">
          Cada varredura vira um snapshot comparável — o digest e os alertas são derivados daqui.
        </p>
      </section>
    </div>
  );
}
