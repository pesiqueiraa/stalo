import type { Lens } from "@stalo/shared";
import { ProfileMenu } from "./ProfileMenu";

interface HeaderProps {
  loading: boolean;
  lastUpdated: string | null;
  lens: Lens | null;
  onLensChange: (lens: Lens) => Promise<void>;
}

export function Header({ loading, lastUpdated, lens, onLensChange }: HeaderProps) {
  const statusText = loading
    ? "buscando e analisando notícias…"
    : lastUpdated
      ? `última atualização: ${new Date(lastUpdated).toLocaleDateString("pt-BR")} às ${new Date(
          lastUpdated,
        ).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
      : "nenhuma varredura ainda";

  return (
    <header>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="logo" src="/logo-branca.svg" alt="Stalo" />
      <div className="header-titles">
        <p>{statusText}</p>
      </div>
      <ProfileMenu lens={lens} onLensChange={onLensChange} />
    </header>
  );
}
