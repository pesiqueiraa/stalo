"use client";

import { useRef, useState } from "react";
import { useEnterpriseWorkspace } from "@/lib/enterpriseWorkspace";
import { useDismiss } from "@/lib/useDismiss";

export function WorkspaceSwitcher() {
  const { radars, activeRadar, setActiveRadarId } = useEnterpriseWorkspace();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useDismiss(ref, () => setOpen(false), open);

  return (
    <div className="ent-switcher" ref={ref}>
      <button
        type="button"
        className="ent-switcher-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="ent-switcher-dot" aria-hidden="true" />
        {activeRadar.name}
        <span className="ent-switcher-chevron" aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="ent-switcher-menu" role="menu">
          {radars.map((r) => (
            <button
              key={r.id}
              type="button"
              role="menuitem"
              className={`ent-switcher-option${r.id === activeRadar.id ? " active" : ""}`}
              onClick={() => {
                setActiveRadarId(r.id);
                setOpen(false);
              }}
            >
              <span>{r.name}</span>
              <span className="ent-switcher-count">{r.topics.length} temas</span>
            </button>
          ))}
          <div className="ent-switcher-new">+ novo radar interno (em breve)</div>
        </div>
      )}
    </div>
  );
}
