"use client";

import { createContext, useContext, useMemo, useState } from "react";
import {
  MOCK_COMPANY,
  MOCK_RADARS,
  type EnterpriseCompany,
  type EnterpriseRadar,
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
}

const EnterpriseWorkspaceContext = createContext<EnterpriseWorkspaceValue | null>(null);

export function EnterpriseWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [activeRadarId, setActiveRadarId] = useState(MOCK_RADARS[0].id);
  const activeRadar = useMemo(
    () => MOCK_RADARS.find((r) => r.id === activeRadarId) ?? MOCK_RADARS[0],
    [activeRadarId],
  );

  const value: EnterpriseWorkspaceValue = {
    company: MOCK_COMPANY,
    radars: MOCK_RADARS,
    activeRadar,
    setActiveRadarId,
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
