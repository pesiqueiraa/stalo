"use client";

import { useState } from "react";
import { useEnterpriseWorkspace } from "@/lib/enterpriseWorkspace";
import { RadarScope } from "@/components/enterprise/RadarScope";
import { AlertWire } from "@/components/enterprise/AlertWire";
import { SignalDrawer } from "@/components/enterprise/SignalDrawer";
import { SignalList } from "@/components/enterprise/SignalList";
import { ScopeStats } from "@/components/enterprise/ScopeStats";
import { ScanTimeline } from "@/components/enterprise/ScanTimeline";
import { TopicLegend } from "@/components/enterprise/TopicLegend";

type ViewMode = "sala" | "lista";

export default function EnterpriseDashboardPage() {
  const { activeRadar } = useEnterpriseWorkspace();
  const [view, setView] = useState<ViewMode>("sala");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // trocar de radar (workspace switcher) limpa a seleção do radar anterior —
  // ajustada durante a renderização (não em efeito), seguindo o padrão do
  // próprio React pra "resetar estado quando uma prop muda".
  const [lastRadarId, setLastRadarId] = useState(activeRadar.id);
  if (activeRadar.id !== lastRadarId) {
    setLastRadarId(activeRadar.id);
    setSelectedId(null);
  }

  function toggleSelect(id: string) {
    setSelectedId((prev) => (prev === id ? null : id));
  }

  return (
    <>
      <div className="ent-page-head">
        <h1>{"// Sala de situação"}</h1>
        <p>
          O mesmo motor de cruzamento do Stalo, ao vivo pro time inteiro — troque de radar no
          seletor do topo.
        </p>
      </div>

      <div className="view-toggle ent-view-toggle" role="tablist" aria-label="Modo de visualização">
        <button
          role="tab"
          aria-selected={view === "sala"}
          className={`view-tab${view === "sala" ? " active" : ""}`}
          onClick={() => setView("sala")}
        >
          Sala
        </button>
        <button
          role="tab"
          aria-selected={view === "lista"}
          className={`view-tab${view === "lista" ? " active" : ""}`}
          onClick={() => setView("lista")}
        >
          Lista
        </button>
      </div>

      <div className="ent-situation">
        {view === "sala" ? (
          <>
            <ScopeStats radar={activeRadar} />
            <ScanTimeline scans={activeRadar.scans} />
            <div className="ent-situation-grid">
              <div className="ent-scope-card">
                <RadarScope radar={activeRadar} selectedId={selectedId} onSelect={toggleSelect} />
                <p className="ent-scope-caption">
                  Anéis = evidência: quanto mais perto do centro, mais fontes sustentam a tese.
                </p>
                <TopicLegend topics={activeRadar.topics} />
              </div>
              <AlertWire radar={activeRadar} selectedId={selectedId} onSelect={toggleSelect} />
            </div>
          </>
        ) : (
          <SignalList radar={activeRadar} selectedId={selectedId} onSelect={toggleSelect} />
        )}
        <SignalDrawer radar={activeRadar} selectedId={selectedId} onClose={() => setSelectedId(null)} />
      </div>
    </>
  );
}
