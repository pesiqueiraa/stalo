"use client";

import { useEffect, useRef, type RefObject } from "react";

// Fecha uma "box" (painel de detalhe, modal…) ao clicar/tocar FORA dela ou ao
// apertar Esc — além do botão de fechar próprio. Usado no projeto todo pra que
// qualquer box aberta por clique também feche clicando em qualquer outro lugar.
//
// - `ref`: aponta pra box; cliques dentro dela nunca fecham.
// - `onDismiss`: o que fazer pra fechar (ex.: setSelectedNode(null)).
// - `active`: liga só quando a box está aberta.
// - `ignoreSelector`: cliques em elementos que casem com esse seletor também
//   NÃO fecham (ex.: `.node` do grafo — clicar num nó troca o conteúdo da box,
//   então não deve fechá-la e reabri-la, o que causaria um "piscar").
//
// Usa a fase de captura pra enxergar o evento mesmo que um handler no meio do
// caminho (ex.: d3-zoom/d3-drag no grafo) pare a propagação.
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  onDismiss: () => void,
  active: boolean,
  ignoreSelector?: string,
) {
  // guarda o callback num ref pra não re-assinar os listeners a cada render
  // (onDismiss costuma ser uma arrow nova toda vez)
  const cb = useRef(onDismiss);
  useEffect(() => {
    cb.current = onDismiss;
  });

  useEffect(() => {
    if (!active) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Element | null;
      if (!target) return;
      if (ref.current?.contains(target)) return;
      if (ignoreSelector && target.closest?.(ignoreSelector)) return;
      cb.current();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") cb.current();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, active, ignoreSelector]);
}
