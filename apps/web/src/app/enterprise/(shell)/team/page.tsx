import { TeamTable } from "@/components/enterprise/TeamTable";
import { SharedBoards } from "@/components/enterprise/SharedBoards";

export default function EnterpriseTeamPage() {
  return (
    <>
      <div className="ent-page-head">
        <h1>{"// Time"}</h1>
        <p>Quem tem acesso ao workspace e o que cada papel pode fazer.</p>
      </div>
      <div className="ent-hud-panel">
        <TeamTable />
      </div>

      <div className="ent-page-head ent-boards-head">
        <h1>{"// Boards compartilhados"}</h1>
        <p>Sinais salvos com dono e audiência — a tese fica do time, não da aba de quem achou.</p>
      </div>
      <SharedBoards />
    </>
  );
}
