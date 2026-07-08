"use client";

import { useState, type FormEvent } from "react";
import { MOCK_TEAM, type TeamMember } from "@/lib/enterpriseMock";
import { useEnterpriseWorkspace } from "@/lib/enterpriseWorkspace";

function randomId() {
  return `u${Math.random().toString(36).slice(2, 8)}`;
}

// Convite/remoção só mexem em estado local do componente — é mock, não há
// backend nem envio de e-mail de verdade por trás disso.
export function TeamTable() {
  const { company } = useEnterpriseWorkspace();
  const [members, setMembers] = useState<TeamMember[]>(MOCK_TEAM);
  const [email, setEmail] = useState("");

  function invite(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) return;
    if (members.some((m) => m.email.toLowerCase() === trimmed.toLowerCase())) return;
    const guessedName = trimmed
      .split("@")[0]
      .replace(/[._]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    setMembers((prev) => [
      ...prev,
      { id: randomId(), name: guessedName, email: trimmed, role: "membro", status: "convite pendente" },
    ]);
    setEmail("");
  }

  function remove(id: string) {
    setMembers((prev) => prev.filter((m) => m.id !== id));
  }

  function toggleRole(id: string) {
    setMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, role: m.role === "admin" ? "membro" : "admin" } : m)),
    );
  }

  return (
    <>
      <table className="ent-team-table">
        <thead>
          <tr>
            <th>Membro</th>
            <th>Papel</th>
            <th>Status</th>
            <th aria-label="Ações" />
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <td>
                <span className="ent-member-name">{m.name}</span>
                <span className="ent-member-email">{m.email}</span>
              </td>
              <td>
                <button
                  type="button"
                  className={`ent-role-badge${m.role === "admin" ? " admin" : ""}`}
                  onClick={() => toggleRole(m.id)}
                  title="Trocar papel"
                >
                  {m.role === "admin" ? "Admin" : "Membro"}
                </button>
              </td>
              <td>
                <span className={`ent-status-pill ${m.status === "ativo" ? "ativo" : "pending"}`}>
                  {m.status === "ativo" ? "Ativo" : "Convite pendente"}
                </span>
              </td>
              <td>
                <button type="button" className="ent-remove-btn" onClick={() => remove(m.id)}>
                  Remover
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <form className="ent-invite-form" onSubmit={invite}>
        <input
          type="email"
          placeholder="email@empresa.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="E-mail para convidar"
        />
        <button type="submit" disabled={!email.trim()}>
          Convidar
        </button>
      </form>
      <p className="ent-seats-note">
        {members.length} de {company.seats.total} seats usados nesse plano.
      </p>
    </>
  );
}
