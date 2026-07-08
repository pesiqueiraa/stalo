"use client";

import { useRef, useState } from "react";
import { useEnterpriseWorkspace } from "@/lib/enterpriseWorkspace";
import { Toast } from "@/components/Toast";

export function BillingPanel() {
  const { company } = useEnterpriseWorkspace();
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function flash(message: string) {
    setToast(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2400);
  }

  const seatsPct = Math.round((company.seats.used / company.seats.total) * 100);
  const scansPct = Math.round((company.scans.used / company.scans.limit) * 100);

  return (
    <>
      <div className="ent-billing-grid">
        <div className="ent-billing-card ent-hud-panel">
          <h3>Plano atual</h3>
          <div className="value">{company.plan}</div>
        </div>

        <div className="ent-billing-card ent-hud-panel">
          <h3>Seats</h3>
          <div className="value">
            {company.seats.used} / {company.seats.total}
          </div>
          <div className="ent-usage-bar">
            <div className="ent-usage-fill" style={{ width: `${seatsPct}%` }} />
          </div>
          <div className="ent-usage-label">{seatsPct}% dos seats do plano em uso</div>
        </div>

        <div className="ent-billing-card ent-hud-panel">
          <h3>Scans no mês</h3>
          <div className="value">
            {company.scans.used} / {company.scans.limit}
          </div>
          <div className="ent-usage-bar">
            <div className="ent-usage-fill" style={{ width: `${scansPct}%` }} />
          </div>
          <div className="ent-usage-label">{scansPct}% do teto mensal de scans do time</div>
        </div>

        <div className="ent-billing-card ent-hud-panel ent-upgrade-card">
          <h3>Precisa de mais?</h3>
          <p>Mais seats, mais scans ou radares internos ilimitados.</p>
          <button
            type="button"
            className="ent-upgrade-btn"
            onClick={() => flash("Upgrade de plano chega em breve.")}
          >
            Fazer upgrade
          </button>
        </div>
      </div>
      <Toast message={toast} />
    </>
  );
}
