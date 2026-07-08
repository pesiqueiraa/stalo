"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEnterpriseWorkspace } from "@/lib/enterpriseWorkspace";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { LiveClock } from "./LiveClock";

const NAV = [
  { href: "/enterprise", label: "Radar" },
  { href: "/enterprise/team", label: "Time" },
  { href: "/enterprise/billing", label: "Cobrança" },
];

export function EnterpriseShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { company } = useEnterpriseWorkspace();

  return (
    <div className="ent-app">
      <header className="ent-topbar">
        <div className="ent-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="ent-logo" src="/logo-branca.svg" alt="Stalo" />
          <span className="ent-badge">Enterprise</span>
        </div>
        <WorkspaceSwitcher />
        <LiveClock />
        <div className="ent-company">
          <span className="ent-company-name">{company.name}</span>
          <span className="ent-company-plan">Plano {company.plan}</span>
        </div>
      </header>
      <div className="ent-body">
        <nav className="ent-nav" aria-label="Navegação enterprise">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`ent-nav-item${pathname === item.href ? " active" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <main className="ent-main">{children}</main>
      </div>
    </div>
  );
}
