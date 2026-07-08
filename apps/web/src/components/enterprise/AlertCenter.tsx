"use client";

import { useState } from "react";
import {
  EVENT_TYPE_INFO,
  MOCK_ALERT_LOG,
  MOCK_ALERT_RULES,
  MOCK_RADARS,
  PRIORITY_INFO,
} from "@/lib/enterpriseMock";

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const radarName = (id: string) => MOCK_RADARS.find((r) => r.id === id)?.name ?? id;

// Alertas de mudança (P1): regra = tipo de evento × prioridade mínima. Os
// toggles só mexem em estado local (mock). E-mail é o canal do MVP; Slack e
// Teams ficam visíveis como "em breve" pra mostrar a direção sem prometer data.
export function AlertCenter() {
  const [rules, setRules] = useState(MOCK_ALERT_RULES);

  function toggle(id: string) {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
  }

  return (
    <div className="ent-alerts">
      <section className="ent-alert-rules ent-hud-panel">
        <header className="ent-panel-title">Regras de alerta</header>
        <ul className="ent-rule-list">
          {rules.map((rule) => (
            <li key={rule.id} className={`ent-rule${rule.enabled ? "" : " off"}`}>
              <button
                type="button"
                role="switch"
                aria-checked={rule.enabled}
                className="ent-switch"
                onClick={() => toggle(rule.id)}
                aria-label={`${rule.enabled ? "Desativar" : "Ativar"} regra: ${rule.label}`}
              >
                <span className="ent-switch-knob" />
              </button>
              <span className="ent-rule-body">
                <span className="ent-rule-label">{rule.label}</span>
                <span className="ent-rule-desc">{rule.description}</span>
                <span className="ent-rule-meta">
                  {rule.eventTypes.length > 0 ? (
                    rule.eventTypes.map((t) => (
                      <span key={t} className="ent-event-chip">
                        {EVENT_TYPE_INFO[t].short}
                      </span>
                    ))
                  ) : (
                    <span className="ent-event-chip">qualquer evento</span>
                  )}
                  <span className={`ent-prio ${rule.minPriority}`}>
                    ≥ {PRIORITY_INFO[rule.minPriority].label}
                  </span>
                </span>
              </span>
            </li>
          ))}
        </ul>
        <div className="ent-channels">
          <span className="ent-channel on">E-mail · ativo</span>
          <span className="ent-channel soon">Slack · em breve</span>
          <span className="ent-channel soon">Teams · em breve</span>
        </div>
      </section>

      <section className="ent-alert-log ent-hud-panel">
        <header className="ent-panel-title">Últimos alertas disparados</header>
        <ul className="ent-log-list">
          {MOCK_ALERT_LOG.map((entry) => (
            <li key={entry.id} className="ent-log-row">
              <span className="ent-log-time">{formatWhen(entry.at)}</span>
              <span className="ent-log-body">
                <span className="ent-log-title">{entry.title}</span>
                <span className="ent-log-meta">
                  {radarName(entry.radarId)} · {entry.trigger}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
