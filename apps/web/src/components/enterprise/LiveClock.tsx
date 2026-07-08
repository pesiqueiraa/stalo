"use client";

import { useEffect, useState } from "react";

function format(d: Date) {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// Relógio real no topo do enterprise inteiro (não só no dashboard) — reforça a
// sensação de painel operacional. Renderiza um placeholder até montar no
// cliente, pra não divergir do HTML gerado no servidor (hora do servidor ≠
// hora do visitante).
export function LiveClock() {
  const [now, setNow] = useState<string | null>(null);

  useEffect(() => {
    setNow(format(new Date()));
    const id = setInterval(() => setNow(format(new Date())), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="ent-clock">
      <span className="ent-live-dot" aria-hidden="true" />
      {now ?? "--:--:--"}
    </span>
  );
}
