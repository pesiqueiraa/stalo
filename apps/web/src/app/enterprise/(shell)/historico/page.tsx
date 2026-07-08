"use client";

import { useEnterpriseWorkspace } from "@/lib/enterpriseWorkspace";
import { ChangeHistory } from "@/components/enterprise/ChangeHistory";

export default function EnterpriseHistoryPage() {
  const { activeRadar } = useEnterpriseWorkspace();

  return (
    <>
      <div className="ent-page-head">
        <h1>{"// Detecção de mudança"}</h1>
        <p>
          O radar não é uma foto: cada varredura vira snapshot, e o que importa é o delta entre
          semanas — o que entrou, o que se confirmou, o que esfriou.
        </p>
      </div>
      <ChangeHistory radar={activeRadar} />
    </>
  );
}
