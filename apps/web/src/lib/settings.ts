// Preferências de visualização do grafo. São de UI (não dado de domínio), então
// vivem no localStorage do navegador, não no Postgres — mantém o backend e o
// schema single-user simples. Se um dia virar multi-device, migram pro banco.

export interface GraphSettings {
  showLinks: boolean; // todas as linhas (mestre)
  showEntityLinks: boolean; // só as arestas notícia↔notícia (as que não tocam insights)
  showLabels: boolean; // títulos ao lado dos nós de notícia
  spread: number; // espaçamento do grafo: <1 junta, >1 separa (default 1)
}

export const DEFAULT_SETTINGS: GraphSettings = {
  showLinks: true,
  showEntityLinks: true,
  showLabels: true,
  spread: 1,
};

const STORAGE_KEY = "stalo:graph-settings";

function loadSettings(): GraphSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<GraphSettings>;
    // merge com os defaults: tolera versões antigas sem alguma chave
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: GraphSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage pode falhar (modo privado, cota) — preferência não é crítica
  }
}

// Store externo mínimo para consumo via useSyncExternalStore no React. Ler o
// localStorage por aqui (em vez de setState num effect) evita mismatch de
// hidratação: o server usa o snapshot default e o client reconcilia sozinho.
let cached: GraphSettings | null = null;
const listeners = new Set<() => void>();

// snapshot precisa ser estável (mesma referência quando nada muda) pra não
// disparar re-render em loop — por isso cacheamos.
export function getSettingsSnapshot(): GraphSettings {
  if (cached === null) cached = loadSettings();
  return cached;
}

export function getServerSettingsSnapshot(): GraphSettings {
  return DEFAULT_SETTINGS;
}

export function setGraphSettings(next: GraphSettings): void {
  cached = next;
  saveSettings(next);
  listeners.forEach((l) => l());
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
