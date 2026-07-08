"use client";

import { useEffect, useState } from "react";
import type { EnterpriseScanRun } from "@/lib/enterpriseMock";

function formatClock(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

interface ScanTimelineProps {
  scans: EnterpriseScanRun[]; // ordem cronológica ascendente
}

// Visualiza a coleta periódica de verdade: cada tick é uma varredura já
// rodada (mock, mas com timestamps e contagens reais), e a contagem regressiva
// no fim mostra quando a próxima entra — a cadência (roadmap "Scan agendado")
// deixa de ser um conceito abstrato e vira algo visível e ao vivo na tela.
export function ScanTimeline({ scans }: ScanTimelineProps) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const last = scans[scans.length - 1];
  const prev = scans[scans.length - 2];
  const intervalMs = prev
    ? new Date(last.at).getTime() - new Date(prev.at).getTime()
    : 12 * 60 * 60 * 1000;
  const nextAt = last ? new Date(last.at).getTime() + intervalMs : null;
  const remaining = now !== null && nextAt !== null ? nextAt - now : null;
  const maxActivity = Math.max(1, ...scans.map((s) => s.newInsights + s.reinforced));

  return (
    <div className="ent-timeline">
      <div className="ent-timeline-ticks">
        {scans.map((scan, i) => {
          const activity = scan.newInsights + scan.reinforced;
          const heightPct = 22 + (activity / maxActivity) * 78;
          const isLast = i === scans.length - 1;
          return (
            <div
              key={scan.id}
              className={`ent-timeline-tick${isLast ? " latest" : ""}`}
              style={{ ["--h" as string]: `${heightPct}%` }}
              title={`${formatWhen(scan.at)} — ${scan.newInsights} ${scan.newInsights === 1 ? "novo" : "novos"}, ${scan.reinforced} ${scan.reinforced === 1 ? "reforçado" : "reforçados"}`}
            />
          );
        })}
      </div>
      <div className="ent-timeline-foot">
        <span>varredura a cada {Math.round(intervalMs / 3600000)}h</span>
        <span className="ent-timeline-next">
          {remaining === null ? (
            "—"
          ) : remaining > 0 ? (
            <>
              próxima em <b>{formatClock(remaining)}</b>
            </>
          ) : (
            "próxima varredura a qualquer momento"
          )}
        </span>
      </div>
    </div>
  );
}
