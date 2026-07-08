import { TeamTable } from "@/components/enterprise/TeamTable";

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
    </>
  );
}
