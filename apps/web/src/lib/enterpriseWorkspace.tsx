"use client";

import { createContext, useContext, useMemo, useState } from "react";
import {
  CURRENT_USER,
  MOCK_COMPANY,
  MOCK_RADARS,
  type EnterpriseCompany,
  type EnterpriseRadar,
  type InsightComment,
} from "@/lib/enterpriseMock";

// Estado do protótipo enterprise (qual dos radares internos está ativo). Vive
// num Context porque o layout (dono do WorkspaceSwitcher) e a página do
// dashboard (dona do brief) são irmãos na árvore de rotas do App Router, não
// pai/filho — não dá pra passar isso como prop.
interface EnterpriseWorkspaceValue {
  company: EnterpriseCompany;
  radars: EnterpriseRadar[];
  activeRadar: EnterpriseRadar;
  setActiveRadarId: (id: string) => void;
  addComment: (insightId: string, text: string) => void;
}

const EnterpriseWorkspaceContext = createContext<EnterpriseWorkspaceValue | null>(null);

export function EnterpriseWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [activeRadarId, setActiveRadarId] = useState(MOCK_RADARS[0].id);
  // notas adicionadas na sessão, por insight — o mock em si é estático, então
  // as novas entradas da thread vivem à parte e são mescladas na leitura.
  const [extraComments, setExtraComments] = useState<Record<string, InsightComment[]>>({});

  const activeRadar = useMemo(() => {
    const base = MOCK_RADARS.find((r) => r.id === activeRadarId) ?? MOCK_RADARS[0];
    return {
      ...base,
      insights: base.insights.map((insight) => {
        const extra = extraComments[insight.id];
        return extra ? { ...insight, comments: [...insight.comments, ...extra] } : insight;
      }),
    };
  }, [activeRadarId, extraComments]);

  function addComment(insightId: string, text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const comment: InsightComment = {
      id: `local-${insightId}-${Date.now()}`,
      author: CURRENT_USER.name,
      at: new Date().toISOString(),
      text: trimmed,
    };
    setExtraComments((prev) => ({ ...prev, [insightId]: [...(prev[insightId] ?? []), comment] }));
  }

  const value: EnterpriseWorkspaceValue = {
    company: MOCK_COMPANY,
    radars: MOCK_RADARS,
    activeRadar,
    setActiveRadarId,
    addComment,
  };

  return (
    <EnterpriseWorkspaceContext.Provider value={value}>
      {children}
    </EnterpriseWorkspaceContext.Provider>
  );
}

export function useEnterpriseWorkspace(): EnterpriseWorkspaceValue {
  const ctx = useContext(EnterpriseWorkspaceContext);
  if (!ctx) {
    throw new Error("useEnterpriseWorkspace precisa estar dentro de <EnterpriseWorkspaceProvider>");
  }
  return ctx;
}
