"use client";

import { useState } from "react";
import { useEnterpriseWorkspace } from "@/lib/enterpriseWorkspace";
import { DigestPreview } from "@/components/enterprise/DigestPreview";
import { AlertCenter } from "@/components/enterprise/AlertCenter";
import { MOCK_DIGEST, MOCK_TEAM } from "@/lib/enterpriseMock";

// Configuração de envio do digest: tudo estado local (mock) — o objetivo é
// mostrar a mecânica (escopo estruturado, cadência, destinatários), não enviar.
function DigestSettingsCard() {
  const { company } = useEnterpriseWorkspace();
  const [recipients, setRecipients] = useState<Set<string>>(new Set(MOCK_DIGEST.recipients));

  function toggle(email: string) {
    setRecipients((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  return (
    <section className="ent-digest-config ent-hud-panel">
      <header className="ent-panel-title">Envio</header>
      <p className="ent-digest-when">
        Toda <b>{MOCK_DIGEST.day}</b> às <b>{MOCK_DIGEST.hour}</b>, um e-mail por radar.
      </p>

      <div className="ent-scope-block">
        <span className="ent-scope-label">Escopo monitorado</span>
        <div className="ent-scope-chips">
          <span className="ent-event-chip">{company.sector}</span>
          {company.competitors.map((c) => (
            <span key={c} className="ent-event-chip">
              {c}
            </span>
          ))}
          {company.products.map((p) => (
            <span key={p} className="ent-event-chip prod">
              {p}
            </span>
          ))}
        </div>
      </div>

      <div className="ent-scope-block">
        <span className="ent-scope-label">Destinatários</span>
        <ul className="ent-recipient-list">
          {MOCK_TEAM.map((member) => (
            <li key={member.id}>
              <label className="ent-recipient">
                <input
                  type="checkbox"
                  checked={recipients.has(member.email)}
                  onChange={() => toggle(member.email)}
                  disabled={member.status !== "ativo"}
                />
                <span className="ent-recipient-name">{member.name}</span>
                <span className="ent-recipient-status">
                  {member.status === "ativo" ? member.email : "convite pendente"}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default function EnterpriseDigestPage() {
  const { activeRadar } = useEnterpriseWorkspace();

  return (
    <>
      <div className="ent-page-head">
        <h1>{"// Digest & alertas"}</h1>
        <p>
          O radar chega no time sem ninguém precisar abrir o Stalo: digest semanal por e-mail e
          alertas imediatos quando algo de alta prioridade aparece.
        </p>
      </div>
      <div className="ent-digest-grid">
        <DigestPreview radar={activeRadar} />
        <div className="ent-digest-side">
          <DigestSettingsCard />
          <AlertCenter />
        </div>
      </div>
    </>
  );
}
