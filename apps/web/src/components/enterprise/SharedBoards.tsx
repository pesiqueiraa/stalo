"use client";

import { MOCK_BOARDS, MOCK_RADARS } from "@/lib/enterpriseMock";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const radarName = (id: string) => MOCK_RADARS.find((r) => r.id === id)?.name ?? id;

// Colaboração leve (P2): sinais salvos viram boards com dono e audiência, em
// vez de aba de navegador de cada analista. Só visual — clicar não navega.
export function SharedBoards() {
  return (
    <div className="ent-boards">
      {MOCK_BOARDS.map((board) => (
        <article key={board.id} className="ent-board ent-hud-panel">
          <h3 className="ent-board-name">{board.name}</h3>
          <p className="ent-board-meta">
            {radarName(board.radarId)} · {board.signals} sinais salvos
          </p>
          <div className="ent-board-foot">
            <span className="ent-board-avatars">
              {board.members.map((member) => (
                <span key={member} className="ent-avatar" title={member}>
                  {initials(member)}
                </span>
              ))}
            </span>
            <span className="ent-board-updated">atualizado {formatWhen(board.updatedAt)}</span>
          </div>
        </article>
      ))}
    </div>
  );
}
