import type { Metadata } from "next";
import { EnterpriseWorkspaceProvider } from "@/lib/enterpriseWorkspace";
import { EnterpriseShell } from "@/components/enterprise/EnterpriseShell";
import "./enterprise.css";

export const metadata: Metadata = {
  title: "Stalo Enterprise",
  description: "Protótipo do workspace enterprise: radar compartilhado por time.",
};

export default function EnterpriseShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <EnterpriseWorkspaceProvider>
      <EnterpriseShell>{children}</EnterpriseShell>
    </EnterpriseWorkspaceProvider>
  );
}
