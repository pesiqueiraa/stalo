// Utilitários só de teste. A suíte roda em `environment: "node"` (vitest.config.ts)
// e o projeto não usa jsdom — então `localStorage` não existe aqui. Em vez de
// trocar o ambiente e pagar por jsdom só para testar um mapa com
// getItem/setItem, injetamos um falso, no mesmo estilo do stubFetch.
export function fakeLocalStorage() {
  const mapa = new Map<string, string>();
  return {
    getItem: (k: string) => mapa.get(k) ?? null,
    setItem: (k: string, v: string) => void mapa.set(k, v),
    removeItem: (k: string) => void mapa.delete(k),
    clear: () => mapa.clear(),
  };
}
