"use client";

import { useMemo } from "react";
import {
  EVENT_TYPE_INFO,
  MOCK_COMPANY,
  MOCK_DIGEST,
  MOCK_WEEKLY_DELTAS,
  READING_FOR_TYPE,
  READING_INFO,
  computePriority,
  type EnterpriseRadar,
} from "@/lib/enterpriseMock";

// Preview do e-mail semanal (P0): os sinais de alta prioridade da semana +
// leitura estratégica + fontes. O corpo é GERADO dos mesmos dados que a sala de
// situação usa (computePriority, eventos das fontes, delta semanal) — o preview
// é literalmente o que o motor mandaria, não um texto decorativo.
export function DigestPreview({ radar }: { radar: EnterpriseRadar }) {
  const ranked = useMemo(
    () =>
      radar.insights
        .map((insight) => ({ insight, priority: computePriority(insight, radar) }))
        .sort((a, b) => b.priority.score - a.priority.score),
    [radar],
  );

  const high = ranked.filter((r) => r.priority.level === "alta");
  const rest = ranked.filter((r) => r.priority.level !== "alta").slice(0, 3);
  const week = (MOCK_WEEKLY_DELTAS[radar.id] ?? [])[0];
  const byId = new Map(radar.items.map((item) => [item.id, item]));

  return (
    <div className="ent-mail">
      <div className="ent-mail-meta">
        <span>
          <b>De:</b> radar@stalo.app
        </span>
        <span>
          <b>Para:</b> {MOCK_DIGEST.recipients.length} pessoas do time
        </span>
        <span>
          <b>Assunto:</b> Digest semanal — {MOCK_COMPANY.name} · {radar.name}
        </span>
      </div>

      <div className="ent-mail-body">
        {week && (
          <p className="ent-mail-lead">
            Semana de {week.label.replace(" (semana atual)", "")}: {week.scans} varreduras,{" "}
            {week.entries.filter((e) => e.kind === "novo").length} sinais novos,{" "}
            {week.entries.filter((e) => e.kind === "subiu").length} subiu pra alta prioridade.
          </p>
        )}

        <div className="ent-mail-section">Alta prioridade</div>
        {high.length === 0 && (
          <p className="ent-mail-quiet">Nenhum sinal de alta prioridade nesta semana.</p>
        )}
        {high.map(({ insight, priority }) => (
          <article key={insight.id} className="ent-mail-item">
            <div className="ent-mail-item-tags">
              <span className="ent-tag" style={{ color: READING_INFO[READING_FOR_TYPE[insight.type]].color }}>
                {READING_INFO[READING_FOR_TYPE[insight.type]].label}
              </span>
              {insight.threat && (
                <span className="ent-tag" style={{ color: READING_INFO.ameaca.color }}>
                  {READING_INFO.ameaca.short}
                </span>
              )}
            </div>
            <h4>{insight.title}</h4>
            <p>{insight.soWhat}</p>
            <p className="ent-mail-why">{priority.reasons.join(" · ")}</p>
            <ul className="ent-mail-sources">
              {insight.related_items.map((id) => {
                const item = byId.get(id);
                if (!item) return null;
                return (
                  <li key={id}>
                    <span className="ent-event-chip">{EVENT_TYPE_INFO[item.eventType].short}</span>
                    <span>
                      {item.title} <i>({item.source})</i>
                    </span>
                  </li>
                );
              })}
            </ul>
          </article>
        ))}

        <div className="ent-mail-section">Também na semana</div>
        <ul className="ent-mail-rest">
          {rest.map(({ insight }) => (
            <li key={insight.id}>
              <span
                className="ent-mail-rest-dot"
                style={{ background: READING_INFO[READING_FOR_TYPE[insight.type]].color }}
              />
              {insight.title}
            </li>
          ))}
        </ul>

        <p className="ent-mail-foot">
          Você recebe este digest toda {MOCK_DIGEST.day} às {MOCK_DIGEST.hour} · responda este
          e-mail pra comentar com o time
        </p>
      </div>
    </div>
  );
}
